import { useWriteContract, useWaitForTransactionReceipt, useChainId, useSimulateContract } from 'wagmi'
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
   * Returns 'SIMULATION_FAILED' if simulateContract fails.
   */
  const swap = useCallback((
    params: XyloNetSwapParams,
    onHash?: (hash: `0x${string}`) => void
  ): 'WRONG_NETWORK' | 'SIMULATION_FAILED' | undefined => {
    // ─── Network guard: refuse execution on wrong chain ───
    if (chainId !== ARC_CHAIN_ID) {
      console.warn('[useXyloNetSwap] BLOCKED: wallet is on wrong network', chainId)
      return 'WRONG_NETWORK'
    }

    const { tokenIn, tokenOut, amountIn, minAmountOut, to, deadline } = params

    // Clear previous simulation error
    setSimulationError(undefined)

    writeContract(
      {
        address: XYLONET_ROUTER_ADDRESS,
        abi: XYLONET_ROUTER_ABI,
        functionName: 'swap',
        args: [
          XYLONET_USDC_EURC_POOL_ADDRESS,
          tokenIn.address as `0x${string}`,
          tokenOut.address as `0x${string}`,
          amountIn,
          minAmountOut,
          to,
          BigInt(deadline),
        ],
        chainId: ARC_CHAIN_ID, // Explicit chain target
      },
      {
        onSuccess: (hash) => {
          setTxHash(hash)
          onHash?.(hash)
        },
        onError: (err) => {
          // Check if the error is a simulation/estimation failure
          const msg = err.message || ''
          if (msg.includes('simulate') || msg.includes('revert') || msg.includes('execution reverted')) {
            setSimulationError('XyloNet swap simulation failed.')
          }
        },
      }
    )
    return undefined
  }, [writeContract, chainId])

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

/**
 * Hook to simulate XyloNet swap before execution.
 * Used to pre-validate the swap will succeed without sending a real tx.
 */
export function useXyloNetSwapSimulation(params: {
  tokenIn: Token
  tokenOut: Token
  amountIn: bigint
  minAmountOut: bigint
  to: `0x${string}` | undefined
  deadline: number
  enabled: boolean
}) {
  const { tokenIn, tokenOut, amountIn, minAmountOut, to, deadline, enabled } = params

  const { data, error, isLoading } = useSimulateContract({
    address: XYLONET_ROUTER_ADDRESS,
    abi: XYLONET_ROUTER_ABI,
    functionName: 'swap',
    args: to ? [
      XYLONET_USDC_EURC_POOL_ADDRESS,
      tokenIn.address as `0x${string}`,
      tokenOut.address as `0x${string}`,
      amountIn,
      minAmountOut,
      to,
      BigInt(deadline),
    ] : undefined,
    chainId: ARC_CHAIN_ID,
    query: {
      enabled: enabled && !!to && amountIn > BigInt(0) && minAmountOut > BigInt(0),
    },
  })

  return {
    simulationData: data,
    simulationError: error,
    isSimulating: isLoading,
  }
}
