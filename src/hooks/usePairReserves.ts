import { useReadContract } from 'wagmi'
import { UNISWAP_V2_PAIR_ABI } from '@/config/abis-dex'
import { USDC_EURC_PAIR_ADDRESS } from '@/config/contracts'
import { USDC, EURC } from '@/config/tokens'

/**
 * Hook to read reserves from the USDC/EURC pair contract.
 *
 * Returns reserves in ERC-20 raw units (6 decimals for both USDC and EURC).
 * NEVER confuse with native gas USDC (18 decimals).
 */
export function usePairReserves() {
  const { data, isLoading, refetch, error } = useReadContract({
    address: USDC_EURC_PAIR_ADDRESS,
    abi: UNISWAP_V2_PAIR_ABI,
    functionName: 'getReserves',
    query: {
      refetchInterval: 15_000, // refresh every 15s
    },
  })

  // Determine token order (pair stores as token0 < token1 by address)
  const usdcIsToken0 = USDC.address.toLowerCase() < EURC.address.toLowerCase()

  const reserves = data as [bigint, bigint, number] | undefined

  const reserveUsdc = reserves
    ? (usdcIsToken0 ? reserves[0] : reserves[1])
    : undefined
  const reserveEurc = reserves
    ? (usdcIsToken0 ? reserves[1] : reserves[0])
    : undefined

  // Compute exchange rate (USDC → EURC)
  const rate = reserveUsdc && reserveEurc && reserveUsdc > BigInt(0)
    ? Number(reserveEurc) / Number(reserveUsdc)
    : undefined

  const hasLiquidity = reserveUsdc !== undefined && reserveUsdc > BigInt(0) && reserveEurc !== undefined && reserveEurc > BigInt(0)

  return {
    reserveUsdc,
    reserveEurc,
    rate,
    hasLiquidity,
    isLoading,
    error,
    refetch,
  }
}
