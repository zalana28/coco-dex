import { useWriteContract, useWaitForTransactionReceipt, useChainId, usePublicClient } from 'wagmi'
import { useState, useCallback } from 'react'
import { XYLONET_ROUTER_ABI } from '@/lib/router/xylonetAdapter'
import { XYLONET_ROUTER_ADDRESS, XYLONET_USDC_EURC_POOL_ADDRESS } from '@/config/externalDexes'
import { arcTestnet } from '@/config/chains'
import type { Token } from '@/types/token'

const ARC_CHAIN_ID = arcTestnet.id
const DEFAULT_DEADLINE_MINUTES = 5

export type XyloNetSwapParams = {
  tokenIn: Token
  tokenOut: Token
  amountIn: bigint
  /** UI quote min-out — only used for dev diagnostics. Execution refreshes quote. */
  minAmountOut: bigint
  slippageBps: number
  account: `0x${string}`
  to: `0x${string}`
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
    details.name, details.shortMessage, details.details,
    details.metaMessages?.join(' '), details.causeShortMessage,
    details.causeReason, details.message,
  ].filter(Boolean).join(' ')
  const n = combined.toLowerCase()

  if (import.meta.env.DEV) {
    console.debug('[useXyloNetSwap] error details:', {
      router: XYLONET_ROUTER_ADDRESS, chainId: ARC_CHAIN_ID, ...details,
    })
  }

  if (n.includes('429') || n.includes('rate limit') || n.includes('too many requests'))
    return 'RPC rate limit reached — wait a moment and try again'
  // Check explicit revert BEFORE generic network/fetch checks to avoid
  // misclassifying ContractFunctionExecutionError (which wraps reverts and
  // may mention 'network' in its message chain).
  if (n.includes('execution reverted') || n.includes('reverted')) {
    const reason = details.causeReason ?? details.details ?? details.shortMessage
    return reason ? `Swap reverted: ${reason}` : 'Swap simulation reverted'
  }
  if (n.includes('rpc request failed') || n.includes('http request failed') || n.includes('fetch failed'))
    return 'RPC unavailable — check your connection and try again'
  if (n.includes('timeout') || n.includes('timed out'))
    return 'RPC request timed out — try again'
  if (n.includes('allowance') || n.includes('insufficient allowance') || n.includes('transfer amount exceeds allowance'))
    return 'Insufficient allowance — approve XyloNet router first'
  if (n.includes('insufficient_output') || n.includes('insufficient output'))
    return 'Slippage too low — increase slippage tolerance'
  if (n.includes('insufficient balance') || n.includes('exceeds balance'))
    return 'Insufficient token balance'
  if (/\bexpired\b/i.test(combined) || combined.includes('EXPIRED'))
    return 'Transaction deadline expired — try again'
  if (n.includes('too little received') || n.includes('minimum') || n.includes('slippage'))
    return 'Min received too high — increase slippage tolerance'
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
  const clearSimulationError = useCallback(() => setSimulationError(undefined), [])

  const swap = useCallback(async (
    params: XyloNetSwapParams,
    onHash?: (hash: `0x${string}`) => void,
  ): Promise<XyloNetSwapResult | undefined> => {
    if (chainId !== ARC_CHAIN_ID) {
      console.warn('[useXyloNetSwap] BLOCKED: wrong network', chainId)
      return { status: 'WRONG_NETWORK', reason: 'Wrong network — switch to Arc Testnet' }
    }

    const { tokenIn, tokenOut, amountIn, minAmountOut: uiMinAmountOut, slippageBps, account, to, deadlineMinutes } = params
    setSimulationError(undefined)

    if (!publicClient) {
      const reason = 'RPC client unavailable — reload and try again'
      setSimulationError(reason)
      return { status: 'SIMULATION_FAILED', reason }
    }

    const safeDeadlineMinutes = Number.isFinite(deadlineMinutes) && deadlineMinutes > 0
      ? deadlineMinutes : DEFAULT_DEADLINE_MINUTES

    // Use wall-clock time — avoids one getBlock RPC round-trip.
    // Arc block time ~2s; wall-clock is accurate for a 5-20 min deadline window.
    const deadlineSeconds = BigInt(Math.floor(Date.now() / 1000)) + BigInt(Math.ceil(safeDeadlineMinutes * 60))
    const path = [tokenIn.address as `0x${string}`, tokenOut.address as `0x${string}`] as const

    // Refresh quote before simulation so minAmountOut is always fresh.
    let freshAmountOut: bigint
    try {
      freshAmountOut = await publicClient.readContract({
        address: XYLONET_ROUTER_ADDRESS,
        abi: XYLONET_ROUTER_ABI,
        functionName: 'getAmountOut',
        args: [path[0], path[1], amountIn],
      })
    } catch (quoteErr: unknown) {
      const reason = classifyXyloNetSimulationError(quoteErr)
      setSimulationError(reason)
      return { status: 'SIMULATION_FAILED', reason }
    }

    const safeSlippageBps = BigInt(Math.min(10_000, Math.max(0, Math.trunc(slippageBps))))
    const freshMinAmountOut = freshAmountOut - (freshAmountOut * safeSlippageBps) / 10_000n

    if (freshAmountOut <= 0n || freshMinAmountOut < 0n) {
      const reason = 'XyloNet pool returned no output — pool may be empty or paused'
      setSimulationError(reason)
      return { status: 'SIMULATION_FAILED', reason }
    }

    const swapArgs = [amountIn, freshMinAmountOut, path, to, deadlineSeconds] as const

    if (import.meta.env.DEV) {
      console.debug('[useXyloNetSwap] swap args:', {
        router: XYLONET_ROUTER_ADDRESS,
        pool: XYLONET_USDC_EURC_POOL_ADDRESS,
        chainId: ARC_CHAIN_ID,
        path,
        amountIn: amountIn.toString(),
        uiMinAmountOut: uiMinAmountOut.toString(),
        freshAmountOut: freshAmountOut.toString(),
        freshMinAmountOut: freshMinAmountOut.toString(),
        slippageBps,
        deadlineSeconds: deadlineSeconds.toString(),
        account,
        recipient: to,
      })
    }

    try {
      await publicClient.simulateContract({
        address: XYLONET_ROUTER_ADDRESS,
        abi: XYLONET_ROUTER_ABI,
        functionName: 'swapExactTokensForTokens',
        args: swapArgs,
        account,
        chain: arcTestnet,
      })
      if (import.meta.env.DEV) console.debug('[useXyloNetSwap] simulation passed')
    } catch (simErr: unknown) {
      const reason = classifyXyloNetSimulationError(simErr)
      if (import.meta.env.DEV) console.debug('[useXyloNetSwap] simulation failed:', { reason, rawError: simErr })
      setSimulationError(reason)
      return { status: 'SIMULATION_FAILED', reason }
    }

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
          if (import.meta.env.DEV) console.log('[useXyloNetSwap] tx sent:', hash)
          setTxHash(hash)
          onHash?.(hash)
        },
        onError: (err) => {
          if (import.meta.env.DEV) console.error('[useXyloNetSwap] writeContract error:', err.message?.slice(0, 200))
          const errMsg = err.message || ''
          if (errMsg.includes('revert') || errMsg.includes('execution reverted'))
            setSimulationError('XyloNet swap reverted on-chain')
        },
      },
    )
    return undefined
  }, [writeContract, chainId, publicClient])

  const resetSwap = useCallback(() => {
    setTxHash(undefined)
    setSimulationError(undefined)
    resetWrite()
  }, [resetWrite])

  return {
    swap, isPending, isConfirming, isSuccess, isReverted,
    txHash, error, simulationError, clearSimulationError, reset: resetSwap,
  }
}
