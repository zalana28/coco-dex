import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useState, useCallback } from 'react'
import { ROUTER_ADDRESS } from '@/config/contracts'
import { UNISWAP_V2_ROUTER_ABI } from '@/config/abis-dex'
import type { Token } from '@/types/token'

/**
 * Hook for executing swapExactTokensForTokens via the CocoRouter.
 *
 * All amounts use ERC-20 decimals (6 for USDC/EURC).
 * NEVER pass native 18-decimal values.
 */
export function useSwap() {
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const { writeContract, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash },
  })

  const swap = useCallback(async (params: {
    tokenIn: Token
    tokenOut: Token
    amountIn: bigint
    amountOutMin: bigint
    to: `0x${string}`
    deadline: number
  }) => {
    const { tokenIn, tokenOut, amountIn, amountOutMin, to, deadline } = params

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
      },
      {
        onSuccess: (hash) => setTxHash(hash),
      }
    )
  }, [writeContract])

  return {
    swap,
    isPending,
    isConfirming,
    isSuccess,
    txHash,
    error,
    reset: () => setTxHash(undefined),
  }
}
