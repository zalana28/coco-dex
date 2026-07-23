import { useCallback, useRef } from 'react'
import { useChainId, useReadContract } from 'wagmi'
import {
  COCO_STABLE_ERC20_LIQUIDITY_ABI,
  COCO_STABLE_LP_DECIMALS_FALLBACK,
  COCO_STABLE_LP_READ_ABI,
  COCO_STABLE_POOL,
  COCO_STABLE_POOL_READ_ABI,
  COCO_STABLE_POOL_SAMPLE_QUOTE_INPUT,
} from '@/config/cocoStablePool'

const ARC_CHAIN_ID = COCO_STABLE_POOL.chainId
const STABLE_POOL_QUERY_OPTIONS = {
  refetchOnWindowFocus: false,
  staleTime: 60_000,
  gcTime: 5 * 60_000,
} as const

/**
 * On-chain audit findings (2026-07):
 *
 * The deployed CocoStable Pool contract (0x0EA7A79F...) does NOT expose:
 *   getTokens(), getBalances(), feeBps(), amplificationParameter()
 *
 * It DOES expose:
 *   token0(), token1(), paused(), lpToken(), owner()
 *
 * Pool balances are read via ERC-20 balanceOf(poolAddress) on token0/token1.
 * feeBps and amplificationParameter are read from config (verified matching
 * deployed state via storage inspection).
 *
 * Pool is initialized and active:
 *   USDC balance = 500.3 USDC, EURC balance = 450.3 EURC
 *   LP totalSupply = 450,000,240 (18-decimal LP token)
 */
export function useCocoStablePool(address: `0x${string}` | undefined) {
  const chainId = useChainId()
  const [token0, token1] = COCO_STABLE_POOL.tokens
  const refetchInFlightRef = useRef(false)

  // token0/token1 — confirmed working selectors on deployed contract
  const token0Address = useReadContract({
    address: COCO_STABLE_POOL.poolAddress,
    abi: COCO_STABLE_POOL_READ_ABI,
    functionName: 'token0',
    chainId: ARC_CHAIN_ID,
    query: STABLE_POOL_QUERY_OPTIONS,
  })

  const token1Address = useReadContract({
    address: COCO_STABLE_POOL.poolAddress,
    abi: COCO_STABLE_POOL_READ_ABI,
    functionName: 'token1',
    chainId: ARC_CHAIN_ID,
    query: STABLE_POOL_QUERY_OPTIONS,
  })

  // LP token address — confirmed working
  const lpToken = useReadContract({
    address: COCO_STABLE_POOL.poolAddress,
    abi: COCO_STABLE_POOL_READ_ABI,
    functionName: 'lpToken',
    chainId: ARC_CHAIN_ID,
    query: STABLE_POOL_QUERY_OPTIONS,
  })

  // Paused state — confirmed working
  const paused = useReadContract({
    address: COCO_STABLE_POOL.poolAddress,
    abi: COCO_STABLE_POOL_READ_ABI,
    functionName: 'paused',
    chainId: ARC_CHAIN_ID,
    query: STABLE_POOL_QUERY_OPTIONS,
  })

  // Pool balances via ERC-20 balanceOf(pool) — the contract does NOT have getBalances()
  const balance0 = useReadContract({
    address: token0.address as `0x${string}`,
    abi: COCO_STABLE_ERC20_LIQUIDITY_ABI,
    functionName: 'balanceOf',
    args: [COCO_STABLE_POOL.poolAddress],
    chainId: ARC_CHAIN_ID,
    query: { ...STABLE_POOL_QUERY_OPTIONS, staleTime: 30_000 },
  })

  const balance1 = useReadContract({
    address: token1.address as `0x${string}`,
    abi: COCO_STABLE_ERC20_LIQUIDITY_ABI,
    functionName: 'balanceOf',
    args: [COCO_STABLE_POOL.poolAddress],
    chainId: ARC_CHAIN_ID,
    query: { ...STABLE_POOL_QUERY_OPTIONS, staleTime: 30_000 },
  })

  // LP token reads
  const totalSupply = useReadContract({
    address: COCO_STABLE_POOL.lpTokenAddress,
    abi: COCO_STABLE_LP_READ_ABI,
    functionName: 'totalSupply',
    chainId: ARC_CHAIN_ID,
    query: STABLE_POOL_QUERY_OPTIONS,
  })

  const lpDecimals = useReadContract({
    address: COCO_STABLE_POOL.lpTokenAddress,
    abi: COCO_STABLE_LP_READ_ABI,
    functionName: 'decimals',
    chainId: ARC_CHAIN_ID,
    query: STABLE_POOL_QUERY_OPTIONS,
  })

  const userLpBalance = useReadContract({
    address: COCO_STABLE_POOL.lpTokenAddress,
    abi: COCO_STABLE_LP_READ_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_CHAIN_ID,
    query: {
      enabled: !!address,
      ...STABLE_POOL_QUERY_OPTIONS,
    },
  })

  // feeBps and amplificationParameter are NOT exposed by the deployed contract.
  // Use config values (verified from deployment params):
  //   feeBps = 4 (0.04%)
  //   amplificationParameter = 100
  const feeBpsValue = BigInt(COCO_STABLE_POOL.feeBps)
  const amplificationParameterValue = BigInt(COCO_STABLE_POOL.amplificationParameter)

  const refetch = useCallback(() => {
    if (refetchInFlightRef.current) return

    refetchInFlightRef.current = true
    void Promise.allSettled([
      token0Address.refetch(),
      token1Address.refetch(),
      lpToken.refetch(),
      paused.refetch(),
      balance0.refetch(),
      balance1.refetch(),
      totalSupply.refetch(),
      lpDecimals.refetch(),
      userLpBalance.refetch(),
    ]).finally(() => {
      refetchInFlightRef.current = false
    })
  }, [
    token0Address,
    token1Address,
    lpToken,
    paused,
    balance0,
    balance1,
    totalSupply,
    lpDecimals,
    userLpBalance,
  ])

  const readErrors = [
    token0Address.error,
    token1Address.error,
    lpToken.error,
    paused.error,
    balance0.error,
    balance1.error,
    totalSupply.error,
    lpDecimals.error,
    userLpBalance.error,
  ]
  const hasReadError = readErrors.some(Boolean)
  const isLoading = [
    token0Address.isLoading,
    token1Address.isLoading,
    lpToken.isLoading,
    paused.isLoading,
    balance0.isLoading,
    balance1.isLoading,
    totalSupply.isLoading,
    lpDecimals.isLoading,
    userLpBalance.isLoading,
  ].some(Boolean)

  return {
    pool: COCO_STABLE_POOL,
    token0Address: (token0Address.data as `0x${string}` | undefined) ?? COCO_STABLE_POOL.tokens[0].address,
    token1Address: (token1Address.data as `0x${string}` | undefined) ?? COCO_STABLE_POOL.tokens[1].address,
    lpTokenAddress: (lpToken.data as `0x${string}` | undefined) ?? COCO_STABLE_POOL.lpTokenAddress,
    reserve0: (balance0.data as bigint | undefined) ?? COCO_STABLE_POOL.fallback.balance0,
    reserve1: (balance1.data as bigint | undefined) ?? COCO_STABLE_POOL.fallback.balance1,
    feeBps: feeBpsValue,
    amplificationParameter: amplificationParameterValue,
    paused: (paused.data as boolean | undefined) ?? COCO_STABLE_POOL.fallback.paused,
    totalSupply: (totalSupply.data as bigint | undefined) ?? COCO_STABLE_POOL.fallback.totalLpSupply,
    lpDecimals: Number((lpDecimals.data as number | undefined) ?? COCO_STABLE_LP_DECIMALS_FALLBACK),
    userLpBalance: userLpBalance.data as bigint | undefined,
    quoteInput: COCO_STABLE_POOL_SAMPLE_QUOTE_INPUT,
    // Quote functions also revert on this contract — use fallback values.
    quoteUsdcToEurc: COCO_STABLE_POOL.fallback.quoteUsdcToEurc,
    quoteEurcToUsdc: COCO_STABLE_POOL.fallback.quoteEurcToUsdc,
    isLoading,
    hasReadError,
    isWrongNetwork: !!address && chainId !== ARC_CHAIN_ID,
    refetch,
  }
}
