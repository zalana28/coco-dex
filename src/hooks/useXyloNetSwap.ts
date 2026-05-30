import { useWriteContract, useWaitForTransactionReceipt, useChainId, usePublicClient } from 'wagmi'
import { useState, useCallback } from 'react'
import { XYLONET_ROUTER_ABI } from '@/lib/router/xylonetAdapter'
import { XYLONET_ROUTER_ADDRESS, XYLONET_USDC_EURC_POOL_ADDRESS } from '@/config/externalDexes'
import { arcTestnet } from '@/config/chains'
import type { Token } from '@/types/token'

const ARC_CHAIN_ID = arcTestnet.id

/**
 * Hook for executing swap via the XyloNet Router.
 *
 * Hard guard: refuses to execute writeContract if chainId !== 5042002.
 * Passes explicit chainId to writeContract.
 *
 * Executes simulateContract before writeContract to catch reverts early.
 * If simulation fails, the transaction is NOT sent and a clear error is surfaced.
 *
 * IMPORTANT: The caller MUST ensure token allowance is sufficient before calling swap().
 * If allowance is insufficient, the simulation will revert on the router's transferFrom
 * and surface a misleading "simulation failed" error. The SwapPage button state machine
 * enforces this by requiring approval before enabling the swap button.
 *
 * XyloNet swap signature:
 *   swap(address pool, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address to, uint256 deadline)
 *
 * Flow: IERC20(tokenIn).approve(XyloNet router, amountIn) → router.swap(...)
 *
 * All amounts use ERC-20 decimals (6 for USDC/EURC on Arc).
 * NEVER pass native 18-decimal values.
 *
 * Deadline is a Unix timestamp in SECONDS (not milliseconds).
 * The caller (SwapPage) uses getDeadlineTimestamp() which returns:
 *   Math.floor(Date.now() / 1000) + deadlineMinutes * 60
 */
export type XyloNetSwapParams = {
  tokenIn: Token
  tokenOut: Token
  amountIn: bigint
  minAmountOut: bigint
  to: `0x${string}`
  /** Unix timestamp in seconds. Must NOT be milliseconds. */
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

  /**
   * Whether the swap receipt indicates a reverted transaction.
   */
  const isReverted = swapReceipt?.status === 'reverted'

  /**
   * Clear simulation error state.
   * Call this after a successful approval so the user can retry the swap.
   */
  const clearSimulationError = useCallback(() => {
    setSimulationError(undefined)
  }, [])

  /**
   * Execute XyloNet swap with simulation pre-check.
   * HARD GUARD: Returns 'WRONG_NETWORK' if not on Arc Testnet.
   *
   * Runs simulateContract first — if it fails, the tx is NOT sent
   * and simulationError is set with a user-friendly message.
   *
   * PREREQUISITE: Token allowance to XyloNet router must be >= amountIn.
   * Do NOT call this if needsApproval is true — it will always fail.
   */
  const swap = useCallback(async (
    params: XyloNetSwapParams,
    onHash?: (hash: `0x${string}`) => void
  ): Promise<'WRONG_NETWORK' | 'SIMULATION_FAILED' | undefined> => {
    // ─── Network guard: refuse execution on wrong chain ───
    if (chainId !== ARC_CHAIN_ID) {
      console.warn('[useXyloNetSwap] BLOCKED: wallet is on wrong network', chainId)
      return 'WRONG_NETWORK'
    }

    const { tokenIn, tokenOut, amountIn, minAmountOut, to, deadline } = params

    // Clear previous errors
    setSimulationError(undefined)

    const swapArgs = [
      XYLONET_USDC_EURC_POOL_ADDRESS,
      tokenIn.address as `0x${string}`,
      tokenOut.address as `0x${string}`,
      amountIn,
      minAmountOut,
      to,
      BigInt(deadline),
    ] as const

    // ─── DEV logging: full swap params before simulation ───
    if (import.meta.env.DEV) {
      console.log('[useXyloNetSwap] Simulating swap:', {
        source: 'xylonet',
        router: XYLONET_ROUTER_ADDRESS,
        pool: XYLONET_USDC_EURC_POOL_ADDRESS,
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        amountIn: amountIn.toString(),
        minAmountOut: minAmountOut.toString(),
        recipient: to,
        deadline,
        deadlineDate: new Date(deadline * 1000).toISOString(),
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
        // ─── DEV logging: detailed simulation error ───
        if (import.meta.env.DEV) {
          const errObj = simErr as Record<string, unknown>
          console.error('[useXyloNetSwap] Simulation FAILED:', {
            name: errObj?.name,
            shortMessage: errObj?.shortMessage,
            message: errObj?.message ? String(errObj.message).slice(0, 200) : undefined,
            details: errObj?.details,
            cause: errObj?.cause,
            metaMessages: errObj?.metaMessages,
          })
        }

        // Determine a user-friendly reason
        const msg = simErr instanceof Error ? simErr.message : String(simErr)
        let reason = 'XyloNet swap simulation failed.'
        if (msg.includes('allowance') || msg.includes('insufficient allowance') || msg.includes('ERC20: transfer amount exceeds allowance')) {
          reason = 'Insufficient allowance — approve the XyloNet router first.'
        } else if (msg.includes('balance') || msg.includes('exceeds balance')) {
          reason = 'Insufficient balance.'
        } else if (msg.includes('EXPIRED') || msg.includes('deadline')) {
          reason = 'Deadline expired.'
        } else if (msg.includes('INSUFFICIENT_OUTPUT') || msg.includes('min')) {
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
        chainId: ARC_CHAIN_ID, // Explicit chain target
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

  /**
   * Reset the swap state so a new swap can be initiated.
   */
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
