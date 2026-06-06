import { useCallback, useRef } from 'react'
import { useChainId, useReadContract } from 'wagmi'
import {
  COCO_STABLE_LP_DECIMALS,
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

export function useCocoStablePool(address: `0x${string}` | undefined) {
  const chainId = useChainId()
  const [token0, token1] = COCO_STABLE_POOL.tokens
  const refetchInFlightRef = useRef(false)

  const tokens = useReadContract({
    address: COCO_STABLE_POOL.poolAddress,
    abi: COCO_STABLE_POOL_READ_ABI,
    functionName: 'getTokens',
    chainId: ARC_CHAIN_ID,
    query: STABLE_POOL_QUERY_OPTIONS,
  })

  const balances = useReadContract({
    address: COCO_STABLE_POOL.poolAddress,
    abi: COCO_STABLE_POOL_READ_ABI,
    functionName: 'getBalances',
    chainId: ARC_CHAIN_ID,
    query: STABLE_POOL_QUERY_OPTIONS,
  })

  const lpToken = useReadContract({
    address: COCO_STABLE_POOL.poolAddress,
    abi: COCO_STABLE_POOL_READ_ABI,
    functionName: 'lpToken',
    chainId: ARC_CHAIN_ID,
    query: STABLE_POOL_QUERY_OPTIONS,
  })

  const feeBps = useReadContract({
    address: COCO_STABLE_POOL.poolAddress,
    abi: COCO_STABLE_POOL_READ_ABI,
    functionName: 'feeBps',
    chainId: ARC_CHAIN_ID,
    query: STABLE_POOL_QUERY_OPTIONS,
  })

  const amplificationParameter = useReadContract({
    address: COCO_STABLE_POOL.poolAddress,
    abi: COCO_STABLE_POOL_READ_ABI,
    functionName: 'amplificationParameter',
    chainId: ARC_CHAIN_ID,
    query: STABLE_POOL_QUERY_OPTIONS,
  })

  const paused = useReadContract({
    address: COCO_STABLE_POOL.poolAddress,
    abi: COCO_STABLE_POOL_READ_ABI,
    functionName: 'paused',
    chainId: ARC_CHAIN_ID,
    query: STABLE_POOL_QUERY_OPTIONS,
  })

  const totalSupply = useReadContract({
    address: COCO_STABLE_POOL.lpTokenAddress,
    abi: COCO_STABLE_LP_READ_ABI,
    functionName: 'totalSupply',
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

  const usdcToEurcQuote = useReadContract({
    address: COCO_STABLE_POOL.poolAddress,
    abi: COCO_STABLE_POOL_READ_ABI,
    functionName: 'getAmountOut',
    args: [token0.address as `0x${string}`, COCO_STABLE_POOL_SAMPLE_QUOTE_INPUT],
    chainId: ARC_CHAIN_ID,
    query: STABLE_POOL_QUERY_OPTIONS,
  })

  const eurcToUsdcQuote = useReadContract({
    address: COCO_STABLE_POOL.poolAddress,
    abi: COCO_STABLE_POOL_READ_ABI,
    functionName: 'getAmountOut',
    args: [token1.address as `0x${string}`, COCO_STABLE_POOL_SAMPLE_QUOTE_INPUT],
    chainId: ARC_CHAIN_ID,
    query: STABLE_POOL_QUERY_OPTIONS,
  })

  const refetch = useCallback(() => {
    if (refetchInFlightRef.current) return

    refetchInFlightRef.current = true
    void Promise.allSettled([
      tokens.refetch(),
      balances.refetch(),
      lpToken.refetch(),
      feeBps.refetch(),
      amplificationParameter.refetch(),
      paused.refetch(),
      totalSupply.refetch(),
      userLpBalance.refetch(),
      usdcToEurcQuote.refetch(),
      eurcToUsdcQuote.refetch(),
    ]).finally(() => {
      refetchInFlightRef.current = false
    })
  }, [
    amplificationParameter,
    balances,
    eurcToUsdcQuote,
    feeBps,
    lpToken,
    paused,
    tokens,
    totalSupply,
    userLpBalance,
    usdcToEurcQuote,
  ])

  const poolTokens = tokens.data as readonly [`0x${string}`, `0x${string}`] | undefined
  const poolBalances = balances.data as readonly [bigint, bigint] | undefined
  const readErrors = [
    tokens.error,
    balances.error,
    lpToken.error,
    feeBps.error,
    amplificationParameter.error,
    paused.error,
    totalSupply.error,
    usdcToEurcQuote.error,
    eurcToUsdcQuote.error,
    userLpBalance.error,
  ]
  const hasReadError = readErrors.some(Boolean)
  const isLoading = [
    tokens.isLoading,
    balances.isLoading,
    lpToken.isLoading,
    feeBps.isLoading,
    amplificationParameter.isLoading,
    paused.isLoading,
    totalSupply.isLoading,
    usdcToEurcQuote.isLoading,
    eurcToUsdcQuote.isLoading,
    userLpBalance.isLoading,
  ].some(Boolean)

  return {
    pool: COCO_STABLE_POOL,
    token0Address: poolTokens?.[0] ?? COCO_STABLE_POOL.tokens[0].address,
    token1Address: poolTokens?.[1] ?? COCO_STABLE_POOL.tokens[1].address,
    lpTokenAddress: (lpToken.data as `0x${string}` | undefined) ?? COCO_STABLE_POOL.lpTokenAddress,
    reserve0: poolBalances?.[0] ?? COCO_STABLE_POOL.fallback.balance0,
    reserve1: poolBalances?.[1] ?? COCO_STABLE_POOL.fallback.balance1,
    feeBps: (feeBps.data as bigint | undefined) ?? BigInt(COCO_STABLE_POOL.feeBps),
    amplificationParameter: (amplificationParameter.data as bigint | undefined) ?? BigInt(COCO_STABLE_POOL.amplificationParameter),
    paused: (paused.data as boolean | undefined) ?? COCO_STABLE_POOL.fallback.paused,
    totalSupply: (totalSupply.data as bigint | undefined) ?? COCO_STABLE_POOL.fallback.totalLpSupply,
    lpDecimals: COCO_STABLE_LP_DECIMALS,
    userLpBalance: userLpBalance.data as bigint | undefined,
    quoteInput: COCO_STABLE_POOL_SAMPLE_QUOTE_INPUT,
    quoteUsdcToEurc: (usdcToEurcQuote.data as bigint | undefined) ?? COCO_STABLE_POOL.fallback.quoteUsdcToEurc,
    quoteEurcToUsdc: (eurcToUsdcQuote.data as bigint | undefined) ?? COCO_STABLE_POOL.fallback.quoteEurcToUsdc,
    isLoading,
    hasReadError,
    isWrongNetwork: !!address && chainId !== ARC_CHAIN_ID,
    refetch,
  }
}
