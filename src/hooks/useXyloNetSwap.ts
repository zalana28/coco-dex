import { useWriteContract, useWaitForTransactionReceipt, useChainId, usePublicClient } from 'wagmi'
import { useState, useCallback } from 'react'
import { XYLONET_ROUTER_ABI } from '@/lib/router/xylonetAdapter'
import { XYLONET_ROUTER_ADDRESS, XYLONET_USDC_EURC_POOL_ADDRESS } from '@/config/externalDexes'
import { arcTestnet } from '@/config/chains'
import type { Token } from '@/types/token'

const ARC_CHAIN_ID = arcTestnet.id

/**
 * Minimum deadline buffer in seconds.
 * If the caller-provided deadline is less than this many seconds in the future,
 * we recompute a fresh deadline to avoid "EXPIRED" reverts.
 */
const MIN_DEADLINE_BUFFER_SECONDS = 60

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
 *   The deadline is received from the caller as a Unix timestamp in seconds.
 *   Before simulation/execution, we verify it's still in the future.
 *   If it's expired or too close to expiry, we recompute a fresh deadline
 *   using DEFAULT_DEADLINE_MINUTES (5 min).
 *
 * Executes simulateContract before writeContract to catch reverts early.
 * If simulation fails, the transaction is NOT sent and a clear error is surfaced.
 *
 * IMPORTANT: The caller MUST ensure token allowance is sufficient before calling swap().
 *
 * XyloNet swap signature:
 *   swap(address pool, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address to, uint256 deadline)
 *
 * All amounts use ERC-20 decimals (6 for USDC/EURC on Arc).
 */
export type XyloNetSwapParams = {
  tokenIn: Token
  tokenOut: Token
  amountIn: bigint
  minAmountOut: bigint
  to: `0x${string}`
  /**
   * Deadline as Unix timestamp in seconds.
   * If this is stale/expired, useXyloNetSwap will recompute a fresh value.
   */
  deadline: number
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
  ): Promise<'WRONG_NETWORK' | 'SIMULATION_FAILED' | undefined> => {
    if (chainId !== ARC_CHAIN_ID) {
      console.warn('[useXyloNetSwap] BLOCKED: wallet is on wrong network', chainId)
      return 'WRONG_NETWORK'
    }

    const { tokenIn, tokenOut, amountIn, minAmountOut, to, deadline: callerDeadline } = params

    setSimulationError(undefined)

    // ─── Compute fresh deadline ───
    // The caller passes a deadline timestamp, but it may have gone stale
    // (e.g. user waited minutes after the button rendered).
    // We validate it's still sufficiently in the future; if not, recompute.
    const nowSeconds = Math.floor(Date.now() / 1000)
    let deadlineSeconds = callerDeadline

    if (deadlineSeconds <= nowSeconds + MIN_DEADLINE_BUFFER_SECONDS) {
      // Caller deadline is expired or about to expire — recompute fresh
      deadlineSeconds = nowSeconds + DEFAULT_DEADLINE_MINUTES * 60
      if (import.meta.env.DEV) {
        console.warn('[useXyloNetSwap] Caller deadline was stale/expired, recomputed fresh deadline:', {
          callerDeadline,
          nowSeconds,
          freshDeadline: deadlineSeconds,
        })
      }
    }

    const secondsUntilDeadline = deadlineSeconds - nowSeconds

    // ─── Block if somehow still expired (shouldn't happen after recompute) ───
    if (secondsUntilDeadline <= 0) {
      setSimulationError('Deadline expired. Try again.')
      return 'SIMULATION_FAILED'
    }

    const swapArgs = [
      XYLONET_USDC_EURC_POOL_ADDRESS,
      tokenIn.address as `0x${string}`,
      tokenOut.address as `0x${string}`,
      amountIn,
      minAmountOut,
      to,
      BigInt(deadlineSeconds),
    ] as const

    // ─── DEV logging ───
    if (import.meta.env.DEV) {
      console.debug('[useXyloNetSwap] XyloNet swap args:', {
        nowSeconds,
        deadlineMinutes: Math.round(secondsUntilDeadline / 60),
        deadlineSeconds: deadlineSeconds.toString(),
        secondsUntilDeadline,
        pool: XYLONET_USDC_EURC_POOL_ADDRESS,
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        amountIn: amountIn.toString(),
        minAmountOut: minAmountOut.toString(),
        recipient: to,
      })
    }

    // ─── Simulate before sending ───
    if (publicClient) {
      try {
        await publicClient.simulateContract({
          address: XYLONET_ROUTER_ADDRESS,
          abi: XYLONET_ROUTER_ABI,
          functionName: 'swap',
          args: swapArgs,
          account: to,
        })
        if (import.meta.env.DEV) {
          console.log('[useXyloNetSwap] Simulation passed ✓')
        }
      } catch (simErr: unknown) {
        if (import.meta.env.DEV) {
          const errObj = simErr as Record<string, unknown>
          console.error('[useXyloNetSwap] Simulation FAILED:', {
            name: errObj?.name,
            shortMessage: errObj?.shortMessage,
            message: errObj?.message ? String(errObj.message).slice(0, 300) : undefined,
            details: errObj?.details,
            cause: errObj?.cause,
            metaMessages: errObj?.metaMessages,
          })
        }

        // Determine a user-friendly reason from the error.
        // IMPORTANT: Match specific revert strings, NOT generic words that
        // appear in viem's function signature metadata (e.g. "deadline" appears
        // in the ABI display for every swap error). Use UPPERCASE or known
        // Solidity revert strings instead.
        const msg = simErr instanceof Error ? simErr.message : String(simErr)
        const shortMsg = (simErr as Record<string, unknown>)?.shortMessage
        const details = String((simErr as Record<string, unknown>)?.details ?? '')
        const combined = `${msg} ${details} ${shortMsg ?? ''}`

        let reason = 'XyloNet swap simulation failed.'
        if (combined.includes('ERC20: transfer amount exceeds allowance') || combined.includes('insufficient allowance')) {
          reason = 'Insufficient allowance — approve the XyloNet router first.'
        } else if (combined.includes('ERC20: transfer amount exceeds balance') || combined.includes('exceeds balance')) {
          reason = 'Insufficient balance.'
        } else if (/\bEXPIRED\b/.test(combined) || /\bexpired\b/.test(details)) {
          reason = 'Deadline expired. Try again.'
        } else if (combined.includes('INSUFFICIENT_OUTPUT') || combined.includes('too little received')) {
          reason = 'Min received too high — increase slippage tolerance.'
        }

        setSimulationError(reason)
        return 'SIMULATION_FAILED'
      }
    }

    // ─── Simulation passed — send real transaction ───
    writeContract(
      {
        address: XYLONET_ROUTER_ADDRESS,
        abi: XYLONET_ROUTER_ABI,
        functionName: 'swap',
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
