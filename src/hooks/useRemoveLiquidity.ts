import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useState, useCallback } from 'react'
import { ROUTER_ADDRESS } from '@/config/contracts'
import { UNISWAP_V2_ROUTER_ABI } from '@/config/abis-dex'
import type { Token } from '@/types/token'

/**
 * Hook for removing liquidity via the CocoRouter.
 *
 * Liquidity amount is in LP token units (18 decimals).
 * amountAMin/amountBMin are in ERC-20 token units (6 decimals for USDC/EURC).
 */
export function useRemoveLiquidity() {
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const { writeContract, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash },
  })

  const removeLiquidity = useCallback(async (params: {
    tokenA: Token
    tokenB: Token
    liquidity: bigint
    amountAMin: bigint
    amountBMin: bigint
    to: `0x${string}`
    deadline: number
  }) => {
    const { tokenA, tokenB, liquidity, amountAMin, amountBMin, to, deadline } = params

    writeContract(
      {
        address: ROUTER_ADDRESS,
        abi: UNISWAP_V2_ROUTER_ABI,
        functionName: 'removeLiquidity',
        args: [
          tokenA.address as `0x${string}`,
          tokenB.address as `0x${string}`,
          liquidity,
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
    removeLiquidity,
    isPending,
    isConfirming,
    isSuccess,
    txHash,
    error,
    reset: () => setTxHash(undefined),
  }
}
