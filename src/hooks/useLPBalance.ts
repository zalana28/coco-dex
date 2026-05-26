import { useReadContract } from 'wagmi'
import { UNISWAP_V2_PAIR_ABI } from '@/config/abis-dex'
import { USDC_EURC_PAIR_ADDRESS } from '@/config/contracts'

/**
 * Hook to read LP token balance for the USDC/EURC pair.
 * LP tokens use 18 decimals regardless of underlying token decimals.
 */
export function useLPBalance(address: `0x${string}` | undefined) {
  const { data, isLoading, refetch } = useReadContract({
    address: USDC_EURC_PAIR_ADDRESS,
    abi: UNISWAP_V2_PAIR_ABI,
    functionName: 'totalSupply',
    query: {
      enabled: !!address,
    },
  })

  // Read user's LP balance using balanceOf pattern from ERC20
  const { data: userBalance, isLoading: isLoadingUser, refetch: refetchUser } = useReadContract({
    address: USDC_EURC_PAIR_ADDRESS,
    abi: [{
      name: 'balanceOf',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ name: '', type: 'uint256' }],
    }] as const,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  })

  const totalSupply = data as bigint | undefined
  const balance = userBalance as bigint | undefined

  // Calculate share percentage
  const share = balance && totalSupply && totalSupply > BigInt(0)
    ? Number(balance) / Number(totalSupply)
    : 0

  return {
    balance,
    totalSupply,
    share,
    isLoading: isLoading || isLoadingUser,
    refetch: () => { refetch(); refetchUser() },
  }
}
