import { useReadContract } from 'wagmi'
import { arcTestnet } from '@/config/chains'
import {
  ERC20_BALANCE_READ_ABI,
  XYLONET_STABLE_POOL_ABI,
  XYLONET_USDC_EURC_STABLE_POOL,
} from '@/config/xylonetStablePools'

const ARC_CHAIN_ID = arcTestnet.id

export function useXyloNetStablePool(address: `0x${string}` | undefined) {
  const pool = XYLONET_USDC_EURC_STABLE_POOL
  const [token0, token1] = pool.tokens
  const token0Address = token0.address as `0x${string}`
  const token1Address = token1.address as `0x${string}`

  const token0Balance = useReadContract({
    address: token0Address,
    abi: ERC20_BALANCE_READ_ABI,
    functionName: 'balanceOf',
    args: [pool.address],
    chainId: ARC_CHAIN_ID,
    query: {
      refetchInterval: 15_000,
    },
  })

  const token1Balance = useReadContract({
    address: token1Address,
    abi: ERC20_BALANCE_READ_ABI,
    functionName: 'balanceOf',
    args: [pool.address],
    chainId: ARC_CHAIN_ID,
    query: {
      refetchInterval: 15_000,
    },
  })

  const totalSupply = useReadContract({
    address: pool.address,
    abi: XYLONET_STABLE_POOL_ABI,
    functionName: 'totalSupply',
    chainId: ARC_CHAIN_ID,
    query: {
      refetchInterval: 15_000,
    },
  })

  const userLpBalance = useReadContract({
    address: pool.address,
    abi: XYLONET_STABLE_POOL_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_CHAIN_ID,
    query: {
      enabled: !!address,
      refetchInterval: 15_000,
    },
  })

  const reserve0 = token0Balance.data as bigint | undefined
  const reserve1 = token1Balance.data as bigint | undefined
  const lpTotalSupply = totalSupply.data as bigint | undefined
  const lpBalance = userLpBalance.data as bigint | undefined

  return {
    pool,
    reserve0,
    reserve1,
    totalSupply: lpTotalSupply,
    userLpBalance: lpBalance,
    isLoading: token0Balance.isLoading || token1Balance.isLoading || totalSupply.isLoading || userLpBalance.isLoading,
    hasReadError: Boolean(token0Balance.error || token1Balance.error || totalSupply.error || userLpBalance.error),
  }
}
