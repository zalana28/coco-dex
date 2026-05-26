import { formatUnits } from 'viem'
import { useBalance } from 'wagmi'

/**
 * Hook for displaying native gas balance ONLY.
 *
 * WARNING: On Arc, the native gas token is USDC at 18 decimals (EVM wei precision).
 * This is NOT the same as ERC-20 USDC which uses 6 decimals.
 *
 * USE THIS HOOK ONLY FOR:
 * - Displaying "gas balance" to the user
 * - Checking if the user can afford gas fees
 *
 * NEVER USE THIS FOR:
 * - DEX swap amounts
 * - Liquidity pool calculations
 * - Token approval amounts
 * - Any DeFi math
 *
 * For DEX operations, always use useTokenBalance() with the ERC-20 interface:
 *   USDC: 0x3600000000000000000000000000000000000000 (6 decimals)
 *   EURC: 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a (6 decimals)
 */
export function useNativeBalance(address: `0x${string}` | undefined) {
  const { data, isLoading, refetch } = useBalance({
    address,
    query: {
      enabled: !!address,
    },
  })

  return {
    /** Native balance in wei (18 decimals). For gas display only. */
    balance: data?.value,
    /** Formatted string with proper decimals for display */
    formatted: data ? formatUnits(data.value, data.decimals) : undefined,
    /** Symbol (USDC on Arc) */
    symbol: data?.symbol,
    /** Decimals (18 for native) */
    decimals: data?.decimals,
    isLoading,
    refetch,
  }
}