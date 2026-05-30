import { useWriteContract, useWaitForTransactionReceipt, useChainId, usePublicClient } from 'wagmi'
import { useState, useCallback } from 'react'
import { XYLONET_ROUTER_ABI } from '@/lib/router/xylonetAdapter'
import { XYLONET_ROUTER_ADDRESS, XYLONET_USDC_EURC_POOL_ADDRESS } from '@/config/externalDexes'
import { arcTestnet } from '@/config/chains'
import type { Token } from '@/types/token'

const ARC_CHAIN_ID = arcTestnet.id

/**
 * Default deadline minutes if none provided or invalid.
 */
const DEFAULT_DEADLINE_MINUTES = 5

/**
 * Hook for executing swap via the XyloNet Router.
 *
 * Hard guard: refuses to execute writeContract if chainId !== 5042002.
 * Passes explicit chainId to writeContract.
 *
 * Deadline handling:
 *   The deadline is derived from the latest Arc block timestamp immediately
 *   before simulation/execution, using the caller's configured minute window.
 *
 * Executes simulateContract before writeContract to catch reverts early.
 * If simulation fails, the transaction is NOT sent and a clear error is surfaced.
 *
 * IMPORTANT: The caller MUST ensure token allowance is sufficient before calling swap().
 *
 * XyloNet swap signature:
 *   swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)
 *
 * All amounts use ERC-20 decimals (6 for USDC/EURC on Arc).
 */
export type XyloNetSwapParams = {
  tokenIn: Token
  tokenOut: Token
  amountIn: bigint
  /**
   * UI quote min-out, used only for dev diagnostics. Execution always refreshes
   * the XyloNet quote immediately before simulation/write.
   */
  minAmountOut: bigint
  slippageBps: number
  account: `0x${string}`
  to: `0x${string}`
  /**
   * User-configured deadline window in minutes. The hook converts this into
   * an Arc block-time deadline immediately before simulation/execution.
   */
  deadlineMinutes: number
}

type XyloNetSwapResult =
  | { status: 'WRONG_NETWORK'; reason: string }
  | { status: 'SIMULATION_FAILED'; reason: string }

type ViemErrorDetails = {
  name?: string
  shortMessage?: string
  details?: string
  metaMessages?: string[]
  causeShortMessage?: string
  causeReason?: string
  message?: string
}

function getErrorField(error: unknown, field: string): unknown {
  if (!error || typeof error !== 'object') return undefined
  return (error as Record<string, unknown>)[field]
}

function stringifyErrorField(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

function getNestedRevertReason(error: unknown): string | undefined {
  const walk = getErrorField(error, 'walk')
  if (typeof walk !== 'function') return stringifyErrorField(getErrorField(error, 'reason'))

  const reasonError = walk.call(error, (value: unknown) => Boolean(getErrorField(value, 'reason')))
  return stringifyErrorField(getErrorField(reasonError, 'reason'))
}

function getViemErrorDetails(error: unknown): ViemErrorDetails {
  const cause = getErrorField(error, 'cause')
  const metaMessages = getErrorField(error, 'metaMessages')

  return {
    name: stringifyErrorField(getErrorField(error, 'name')),
    shortMessage: stringifyErrorField(getErrorField(error, 'shortMessage')),
    details: stringifyErrorField(getErrorField(error, 'details')),
    metaMessages: Array.isArray(metaMessages) ? metaMessages.map(String) : undefined,
    causeShortMessage: stringifyErrorField(getErrorField(cause, 'shortMessage')),
    causeReason: getNestedRevertReason(error) ?? stringifyErrorField(getErrorField(cause, 'reason')),
    message: error instanceof Error ? error.message : stringifyErrorField(error),
  }
}

function classifyXyloNetSimulationError(error: unknown): string {
  const details = getViemErrorDetails(error)
  const combined = [
    details.name,
    details.shortMessage,
    details.details,
    details.metaMessages?.join(' '),
    details.causeShortMessage,
    details.causeReason,
    details.message,
  ].filter(Boolean).join(' ')
  const normalized = combined.toLowerCase()

  if (normalized.includes('allowance') || normalized.includes('erc20: insufficient allowance') || normalized.includes('transfer amount exceeds allowance')) {
    return 'Insufficient allowance for XyloNet router'
  }
  if (normalized.includes('insufficient balance') || normalized.includes('transfer amount exceeds balance') || normalized.includes('exceeds balance')) {
    return 'Insufficient balance'
  }
  if (/\bexpired\b/i.test(combined) || combined.includes('EXPIRED')) {
    return 'Deadline expired'
  }
  if (normalized.includes('insufficient_output') || normalized.includes('too little received') || normalized.includes('minimum') || normalized.includes('slippage')) {
    return 'Min received too high'
  }
  if (normalized.includes('execution reverted') || normalized.includes('reverted')) {
    return 'Router reverted'
  }

  const fallback = details.shortMessage ?? details.causeShortMessage ?? details.details ?? details.causeReason ?? details.message
  return fallback ? `XyloNet simulation failed: ${fallback}` : 'XyloNet simulation failed'
}

export function useXyloNetSwap() {
  const chainId = useChainId()
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID })
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const [simulationError, setSimulationError] = useState<string | undefined>()
  const { writeContract, isPending, error, reset: resetWrite } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: swapReceipt } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash },
  })

  const isReverted = swapReceipt?.status === 'reverted'

  const clearSimulationError = useCallback(() => {
    setSimulationError(undefined)
  }, [])

  /**
   * Execute XyloNet swap with simulation pre-check.
   *
   * Deadline is validated and refreshed if stale before any on-chain call.
   */
  const swap = useCallback(async (
    params: XyloNetSwapParams,
    onHash?: (hash: `0x${string}`) => void
  ): Promise<XyloNetSwapResult | undefined> => {
    if (chainId !== ARC_CHAIN_ID) {
      console.warn('[useXyloNetSwap] BLOCKED: wallet is on wrong network', chainId)
      return { status: 'WRONG_NETWORK', reason: 'Wrong network' }
    }

    const { tokenIn, tokenOut, amountIn, minAmountOut: uiMinAmountOut, slippageBps, account, to, deadlineMinutes } = params

    setSimulationError(undefined)

    if (!publicClient) {
      const reason = 'XyloNet simulation failed: RPC client unavailable'
      setSimulationError(reason)
      return { status: 'SIMULATION_FAILED', reason }
    }

    const safeDeadlineMinutes = Number.isFinite(deadlineMinutes) && deadlineMinutes > 0
      ? deadlineMinutes
      : DEFAULT_DEADLINE_MINUTES
    const latestBlock = await publicClient.getBlock({ blockTag: 'latest' })
    const latestBlockTimestamp = latestBlock.timestamp
    const deadlineSeconds = latestBlockTimestamp + BigInt(Math.ceil(safeDeadlineMinutes * 60))
    const path = [tokenIn.address as `0x${string}`, tokenOut.address as `0x${string}`] as const

    const freshAmountOut = await publicClient.readContract({
      address: XYLONET_ROUTER_ADDRESS,
      abi: XYLONET_ROUTER_ABI,
      functionName: 'getAmountOut',
      args: [path[0], path[1], amountIn],
    })
    const safeSlippageBps = BigInt(Math.min(10_000, Math.max(0, Math.trunc(slippageBps))))
    const freshMinAmountOut = freshAmountOut - (freshAmountOut * safeSlippageBps) / 10_000n

    if (freshAmountOut <= 0n || freshMinAmountOut < 0n) {
      const reason = 'XyloNet simulation failed: fresh quote returned no output'
      setSimulationError(reason)
      return { status: 'SIMULATION_FAILED', reason }
    }

    const swapArgs = [
      amountIn,
      freshMinAmountOut,
      path,
      to,
      deadlineSeconds,
    ] as const

    // ─── DEV logging ───
    if (import.meta.env.DEV) {
      console.debug('[useXyloNetSwap] XyloNet swap args:', {
        latestBlockNumber: latestBlock.number?.toString(),
        latestBlockTimestamp: latestBlockTimestamp.toString(),
        deadlineMinutes: safeDeadlineMinutes,
        deadlineSeconds: deadlineSeconds.toString(),
        pool: XYLONET_USDC_EURC_POOL_ADDRESS,
        path,
        amountIn: amountIn.toString(),
        uiMinAmountOut: uiMinAmountOut.toString(),
        freshAmountOut: freshAmountOut.toString(),
        freshMinAmountOut: freshMinAmountOut.toString(),
        slippageBps,
        account,
        recipient: to,
      })
    }

    // ─── Simulate before sending ───
    try {
      await publicClient.simulateContract({
        address: XYLONET_ROUTER_ADDRESS,
        abi: XYLONET_ROUTER_ABI,
        functionName: 'swapExactTokensForTokens',
        args: swapArgs,
        account,
        chain: arcTestnet,
      })
      if (import.meta.env.DEV) {
        console.debug('[useXyloNetSwap] Simulation passed')
      }
    } catch (simErr: unknown) {
      const reason = classifyXyloNetSimulationError(simErr)

      if (import.meta.env.DEV) {
        console.debug('[useXyloNetSwap] Simulation failed:', {
          ...getViemErrorDetails(simErr),
          reason,
          rawError: simErr,
        })
      }

      setSimulationError(reason)
      return { status: 'SIMULATION_FAILED', reason }
    }

    // ─── Simulation passed — send real transaction ───
    writeContract(
      {
        address: XYLONET_ROUTER_ADDRESS,
        abi: XYLONET_ROUTER_ABI,
        functionName: 'swapExactTokensForTokens',
        args: swapArgs,
        chainId: ARC_CHAIN_ID,
      },
      {
        onSuccess: (hash) => {
          if (import.meta.env.DEV) {
            console.log('[useXyloNetSwap] Transaction sent:', hash)
          }
          setTxHash(hash)
          onHash?.(hash)
        },
        onError: (err) => {
          if (import.meta.env.DEV) {
            console.error('[useXyloNetSwap] writeContract error:', err.message?.slice(0, 200))
          }
          const errMsg = err.message || ''
          if (errMsg.includes('revert') || errMsg.includes('execution reverted')) {
            setSimulationError('XyloNet swap reverted.')
          }
        },
      }
    )
    return undefined
  }, [writeContract, chainId, publicClient])

  const resetSwap = useCallback(() => {
    setTxHash(undefined)
    setSimulationError(undefined)
    resetWrite()
  }, [resetWrite])

  return {
    swap,
    isPending,
    isConfirming,
    isSuccess,
    isReverted,
    txHash,
    error,
    simulationError,
    clearSimulationError,
    reset: resetSwap,
  }
}
