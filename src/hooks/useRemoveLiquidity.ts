import { useWriteContract, useWaitForTransactionReceipt, useChainId } from 'wagmi'
import { useState, useCallback } from 'react'
import { ROUTER_ADDRESS } from '@/config/contracts'
import { UNISWAP_V2_ROUTER_ABI } from '@/config/abis-dex'
import { arcTestnet } from '@/config/chains'
import type { Token } from '@/types/token'

const ARC_CHAIN_ID = arcTestnet.id

/**
 * Hook for removing liquidity via the CocoRouter.
 *
 * Hard guard: refuses to execute writeContract if chainId !== 5042002.
 * Passes explicit chainId to writeContract.
 *
 * Liquidity amount is in LP token units (18 decimals).
 * amountAMin/amountBMin are in ERC-20 token units (6 decimals for USDC/EURC).
 */
export function useRemoveLiquidity() {
  const chainId = useChainId()
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const { writeContract, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash },
  })

  const removeLiquidity = useCallback((params: {
    tokenA: Token
    tokenB: Token
    liquidity: bigint
    amountAMin: bigint
    amountBMin: bigint
    to: `0x${string}`
    deadline: number
  }): 'WRONG_NETWORK' | undefined => {
    // ─── Network guard: refuse execution on wrong chain ───
    if (chainId !== ARC_CHAIN_ID) {
      console.warn('[useRemoveLiquidity] BLOCKED: wallet is on wrong network', chainId)
      return 'WRONG_NETWORK'
    }

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
        chainId: ARC_CHAIN_ID, // Explicit chain target
      },
      {
        onSuccess: (hash) => setTxHash(hash),
      }
    )
    return undefined
  }, [writeContract, chainId])

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
