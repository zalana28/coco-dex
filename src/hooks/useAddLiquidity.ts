import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useState, useCallback } from 'react'
import { ROUTER_ADDRESS } from '@/config/contracts'
import { UNISWAP_V2_ROUTER_ABI } from '@/config/abis-dex'
import type { Token } from '@/types/token'

/**
 * Hook for adding liquidity via the CocoRouter.
 *
 * All amounts use ERC-20 decimals (6 for USDC/EURC).
 * NEVER pass native 18-decimal values.
 */
export function useAddLiquidity() {
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const { writeContract, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash },
  })

  const addLiquidity = useCallback(async (params: {
    tokenA: Token
    tokenB: Token
    amountA: bigint
    amountB: bigint
    amountAMin: bigint
    amountBMin: bigint
    to: `0x${string}`
    deadline: number
  }) => {
    const { tokenA, tokenB, amountA, amountB, amountAMin, amountBMin, to, deadline } = params

    writeContract(
      {
        address: ROUTER_ADDRESS,
        abi: UNISWAP_V2_ROUTER_ABI,
        functionName: 'addLiquidity',
        args: [
          tokenA.address as `0x${string}`,
          tokenB.address as `0x${string}`,
          amountA,
          amountB,
          amountAMin,
          amountBMin,
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
    addLiquidity,
    isPending,
    isConfirming,
    isSuccess,
    txHash,
    error,
    reset: () => setTxHash(undefined),
  }
}
