import { useWriteContract, useWaitForTransactionReceipt, useChainId } from 'wagmi'
import { useState, useCallback } from 'react'
import { ROUTER_ADDRESS } from '@/config/contracts'
import { UNISWAP_V2_ROUTER_ABI } from '@/config/abis-dex'
import { arcTestnet } from '@/config/chains'
import type { Token } from '@/types/token'

const ARC_CHAIN_ID = arcTestnet.id

/**
 * Hook for executing swapExactTokensForTokens via the CocoRouter.
 *
 * Hard guard: refuses to execute writeContract if chainId !== 5042002.
 * Passes explicit chainId to writeContract.
 *
 * All amounts use ERC-20 decimals (6 for USDC/EURC).
 * NEVER pass native 18-decimal values.
 *
 * The tx hash is exposed so callers can track progress independently.
 */
export function useSwap() {
  const chainId = useChainId()
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const { writeContract, isPending, error, reset: resetWrite } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: swapReceipt } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash },
  })

  /**
   * Whether the swap receipt indicates a reverted transaction.
   */
  const isReverted = swapReceipt?.status === 'reverted'

  const swap = useCallback((
    params: {
      tokenIn: Token
      tokenOut: Token
      amountIn: bigint
      amountOutMin: bigint
      account: `0x${string}`
      to: `0x${string}`
      deadline: number
    },
    onHash?: (hash: `0x${string}`) => void
  ): 'WRONG_NETWORK' | undefined => {
    // ─── Network guard: refuse execution on wrong chain ───
    if (chainId !== ARC_CHAIN_ID) {
      console.warn('[useSwap] BLOCKED: wallet is on wrong network', chainId)
      return 'WRONG_NETWORK'
    }

    const { tokenIn, tokenOut, amountIn, amountOutMin, account, to, deadline } = params

    writeContract(
      {
        address: ROUTER_ADDRESS,
        abi: UNISWAP_V2_ROUTER_ABI,
        functionName: 'swapExactTokensForTokens',
        args: [
          amountIn,
          amountOutMin,
          [tokenIn.address as `0x${string}`, tokenOut.address as `0x${string}`],
          to,
          BigInt(deadline),
        ],
        account,
        chainId: ARC_CHAIN_ID, // Explicit chain target
      },
      {
        onSuccess: (hash) => {
          setTxHash(hash)
          onHash?.(hash)
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
    reset: resetSwap,
  }
}
