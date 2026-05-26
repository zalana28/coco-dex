import { useReadContract } from 'wagmi'
import { ERC20_ABI } from '@/config/abis'
import type { Token } from '@/types/token'

/**
 * Hook to fetch ERC-20 token balance for connected wallet.
 *
 * This is the CORRECT hook for all DEX operations (swaps, pools, approvals).
 * It reads balanceOf() from the ERC-20 contract, returning 6-decimal amounts
 * for both USDC and EURC on Arc Testnet.
 *
 * DO NOT use wagmi's useBalance() for DEX token amounts — that returns
 * native gas balance at 18 decimals. Use useNativeBalance() for gas display only.
 */
export function useTokenBalance(token: Token | undefined, address: `0x${string}` | undefined) {
  const { data, isLoading, refetch } = useReadContract({
    address: token?.address as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!token && !!address,
    },
  })

  return {
    balance: data as bigint | undefined,
    isLoading,
    refetch,
  }
}

/**
 * Hook to check ERC-20 token allowance for a spender.
 */
export function useTokenAllowance(
  token: Token | undefined,
  owner: `0x${string}` | undefined,
  spender: `0x${string}` | undefined
) {
  const { data, isLoading, refetch } = useReadContract({
    address: token?.address as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: owner && spender ? [owner, spender] : undefined,
    query: {
      enabled: !!token && !!owner && !!spender,
    },
  })

  return {
    allowance: data as bigint | undefined,
    isLoading,
    refetch,
  }
}
