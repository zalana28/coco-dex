import { useWriteContract, useWaitForTransactionReceipt, useChainId } from 'wagmi'
import { useState, useCallback } from 'react'
import { ROUTER_ADDRESS } from '@/config/contracts'
import { UNISWAP_V2_ROUTER_ABI } from '@/config/abis-dex'
import { arcTestnet } from '@/config/chains'
import type { Token } from '@/types/token'

const ARC_CHAIN_ID = arcTestnet.id

/**
 * Hook for adding liquidity via the CocoRouter.
 *
 * Hard guard: refuses to execute writeContract if chainId !== 5042002.
 * Passes explicit chainId to writeContract.
 *
 * All amounts use ERC-20 decimals (6 for USDC/EURC).
 */
export function useAddLiquidity() {
  const chainId = useChainId()
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const { writeContract, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash },
  })

  const addLiquidity = useCallback((params: {
    tokenA: Token
    tokenB: Token
    amountA: bigint
    amountB: bigint
    amountAMin: bigint
    amountBMin: bigint
    to: `0x${string}`
    deadline: number
  }): 'WRONG_NETWORK' | undefined => {
    // ─── Network guard: refuse execution on wrong chain ───
    if (chainId !== ARC_CHAIN_ID) {
      console.warn('[useAddLiquidity] BLOCKED: wallet is on wrong network', chainId)
      return 'WRONG_NETWORK'
    }

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
        chainId: ARC_CHAIN_ID, // Explicit chain target
      },
      {
        onSuccess: (hash) => setTxHash(hash),
      }
    )
    return undefined
  }, [writeContract, chainId])

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
