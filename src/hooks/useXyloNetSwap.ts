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
 * XyloNet swap signature:
 *   swap(address pool, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address to, uint256 deadline)
 *
 * Flow: IERC20(tokenIn).approve(XyloNet router, amountIn) → router.swap(...)
 *
 * All amounts use ERC-20 decimals (6 for USDC/EURC on Arc).
 * NEVER pass native 18-decimal values.
 */
export type XyloNetSwapParams = {
  tokenIn: Token
  tokenOut: Token
  amountIn: bigint
  minAmountOut: bigint
  to: `0x${string}`
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
   * Execute XyloNet swap with simulation pre-check.
   * HARD GUARD: Returns 'WRONG_NETWORK' if not on Arc Testnet.
   *
   * Runs simulateContract first — if it fails, the tx is NOT sent
   * and simulationError is set with a user-friendly message.
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
      } catch (simErr: unknown) {
        const msg = simErr instanceof Error ? simErr.message : String(simErr)
        const shortMsg = msg.length > 120 ? msg.slice(0, 120) + '…' : msg
        console.warn('[useXyloNetSwap] Simulation failed:', shortMsg)
        setSimulationError('XyloNet swap simulation failed.')
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
          setTxHash(hash)
          onHash?.(hash)
        },
        onError: (err) => {
          const msg = err.message || ''
          if (msg.includes('revert') || msg.includes('execution reverted')) {
            setSimulationError('XyloNet swap simulation failed.')
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
    reset: resetSwap,
  }
}
