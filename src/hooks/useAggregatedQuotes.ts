import { useMemo, useState } from 'react'
import { useChainId, useReadContract } from 'wagmi'
import { arcTestnet } from '@/config/chains'
import { COCO_STABLE_POOL, COCO_STABLE_POOL_READ_ABI } from '@/config/cocoStablePool'
import { EXTERNAL_DEXES } from '@/config/externalDexes'
import type { Token } from '@/types/token'
import { getCocoRouteQuote } from '@/lib/router/cocoAdapter'
import { buildCocoStableShadowRouteQuote, isCocoStablePairSupported } from '@/lib/router/cocoStableAdapter'
import { buildSynthraRouteQuote, getSynthraV3QuoteRequest, isSynthraPairSupported, SYNTHRA_V3_QUOTER_ABI } from '@/lib/router/synthraAdapter'
import { buildXyloNetRouteQuote, isXyloNetPairSupported, XYLONET_ROUTER_ABI } from '@/lib/router/xylonetAdapter'
import { buildUnitFlowRouteQuote, getUnitFlowV25QuoteRequest, isUnitFlowPairSupported, UNITFLOW_V25_ROUTER_ABI } from '@/lib/router/unitflowAdapter'
import type { RouteQuote } from '@/lib/router/types'
import { ROUTER_SHADOW_MODE_CONFIG } from '@/lib/router/routerConfig'
import { selectBestRoute } from '@/lib/router/selectBestRoute'

type UseAggregatedQuotesParams = {
  tokenIn: Token
  tokenOut: Token
  amountIn: bigint
  reserveUsdc?: bigint
  reserveEurc?: bigint
  slippageBps: number
  selectedQuoteId?: string
}

const BETTER_ROUTE_WARNING_THRESHOLD_BPS = BigInt(500)
const QUOTE_REFETCH_INTERVAL_MS = 30_000
const QUOTE_RETRY_COUNT = 2
const QUOTE_STALE_TIME_MS = 30_000

export function useAggregatedQuotes({
  tokenIn,
  tokenOut,
  amountIn,
  reserveUsdc,
  reserveEurc,
  slippageBps,
  selectedQuoteId,
}: UseAggregatedQuotesParams) {
  const [quoteTimestamp] = useState(() => Date.now())
  const connectedChainId = useChainId()
  const shouldReadXyloNet = amountIn > BigInt(0) && isXyloNetPairSupported(tokenIn, tokenOut)
  const shouldReadCocoStable = ROUTER_SHADOW_MODE_CONFIG.nativeStable.quoteOnly && amountIn > BigInt(0) && isCocoStablePairSupported(tokenIn, tokenOut)
  const xylonet = EXTERNAL_DEXES.xylonet
  const unitflow = EXTERNAL_DEXES.unitflow
  const synthra = EXTERNAL_DEXES.synthra
  const unitflowQuoteRequest = useMemo(() => getUnitFlowV25QuoteRequest(tokenIn, tokenOut, amountIn), [amountIn, tokenIn, tokenOut])
  const synthraQuoteRequest = useMemo(() => getSynthraV3QuoteRequest(tokenIn, tokenOut, amountIn), [amountIn, tokenIn, tokenOut])
  const shouldReadUnitFlow = amountIn > BigInt(0) && isUnitFlowPairSupported(tokenIn, tokenOut) && Boolean(unitflowQuoteRequest)
  const shouldReadSynthra = amountIn > BigInt(0) && isSynthraPairSupported(tokenIn, tokenOut) && Boolean(synthraQuoteRequest)

  const { data: xylonetAmountOut, isLoading: isXyloNetLoading, error: xylonetError } = useReadContract({
    address: xylonet.routerAddress,
    abi: XYLONET_ROUTER_ABI,
    functionName: 'getAmountOut',
    args: [tokenIn.address as `0x${string}`, tokenOut.address as `0x${string}`, amountIn],
    chainId: arcTestnet.id,
    query: {
      enabled: shouldReadXyloNet,
      refetchInterval: QUOTE_REFETCH_INTERVAL_MS,
      retry: QUOTE_RETRY_COUNT,
      retryDelay: 1_000,
      staleTime: QUOTE_STALE_TIME_MS,
    },
  })

  const { data: cocoStableAmountOut, isLoading: isCocoStableLoading, error: cocoStableError } = useReadContract({
    address: COCO_STABLE_POOL.poolAddress,
    abi: COCO_STABLE_POOL_READ_ABI,
    functionName: 'getAmountOut',
    args: [tokenIn.address as `0x${string}`, amountIn],
    chainId: arcTestnet.id,
    query: {
      enabled: shouldReadCocoStable,
      refetchInterval: QUOTE_REFETCH_INTERVAL_MS,
      retry: QUOTE_RETRY_COUNT,
      retryDelay: 1_000,
      staleTime: QUOTE_STALE_TIME_MS,
    },
  })

  const { data: unitflowAmountsOut, isLoading: isUnitFlowLoading, error: unitflowError } = useReadContract({
    address: unitflow.v25.swapRouterAddress,
    abi: UNITFLOW_V25_ROUTER_ABI,
    functionName: 'getAmountsOut',
    args: [unitflowQuoteRequest?.amountIn ?? BigInt(0), unitflowQuoteRequest?.path ?? [unitflow.v25.wusdcAddress, unitflow.v25.wusdcAddress]],
    chainId: arcTestnet.id,
    query: {
      enabled: shouldReadUnitFlow,
      refetchInterval: QUOTE_REFETCH_INTERVAL_MS,
      retry: QUOTE_RETRY_COUNT,
      retryDelay: 1_000,
      staleTime: QUOTE_STALE_TIME_MS,
    },
  })

  const synthraQuoteArgs = (fee: 500 | 3_000 | 10_000) => [{
    tokenIn: synthraQuoteRequest?.tokenIn ?? synthra.supportedTokens.USDC,
    tokenOut: synthraQuoteRequest?.tokenOut ?? synthra.supportedTokens.EURC,
    amountIn: synthraQuoteRequest?.amountIn ?? BigInt(0),
    fee,
    sqrtPriceLimitX96: BigInt(0),
    recipient: synthraQuoteRequest?.recipient ?? '0x0000000000000000000000000000000000000000',
  }] as const

  const { data: synthraFee500AmountOut, isLoading: isSynthraFee500Loading, error: synthraFee500Error } = useReadContract({
    address: synthra.v3.quoterAddress,
    abi: SYNTHRA_V3_QUOTER_ABI,
    functionName: 'quoteExactInputSingle',
    args: synthraQuoteArgs(500),
    chainId: arcTestnet.id,
    query: {
      enabled: shouldReadSynthra,
      refetchInterval: QUOTE_REFETCH_INTERVAL_MS,
      retry: QUOTE_RETRY_COUNT,
      retryDelay: 1_000,
      staleTime: QUOTE_STALE_TIME_MS,
    },
  })

  const { data: synthraFee3000AmountOut, isLoading: isSynthraFee3000Loading, error: synthraFee3000Error } = useReadContract({
    address: synthra.v3.quoterAddress,
    abi: SYNTHRA_V3_QUOTER_ABI,
    functionName: 'quoteExactInputSingle',
    args: synthraQuoteArgs(3_000),
    chainId: arcTestnet.id,
    query: {
      enabled: shouldReadSynthra,
      refetchInterval: QUOTE_REFETCH_INTERVAL_MS,
      retry: QUOTE_RETRY_COUNT,
      retryDelay: 1_000,
      staleTime: QUOTE_STALE_TIME_MS,
    },
  })

  const { data: synthraFee10000AmountOut, isLoading: isSynthraFee10000Loading, error: synthraFee10000Error } = useReadContract({
    address: synthra.v3.quoterAddress,
    abi: SYNTHRA_V3_QUOTER_ABI,
    functionName: 'quoteExactInputSingle',
    args: synthraQuoteArgs(10_000),
    chainId: arcTestnet.id,
    query: {
      enabled: shouldReadSynthra,
      refetchInterval: QUOTE_REFETCH_INTERVAL_MS,
      retry: QUOTE_RETRY_COUNT,
      retryDelay: 1_000,
      staleTime: QUOTE_STALE_TIME_MS,
    },
  })

  const isSynthraLoading = isSynthraFee500Loading || isSynthraFee3000Loading || isSynthraFee10000Loading
  const synthraError = synthraFee500Error && synthraFee3000Error && synthraFee10000Error
    ? synthraFee500Error
    : undefined

  return useMemo(() => {
    const cocoQuote = getCocoRouteQuote({ tokenIn, tokenOut, amountIn, reserveUsdc, reserveEurc, slippageBps })
    const xylonetQuote = buildXyloNetRouteQuote({
      tokenIn,
      tokenOut,
      amountIn,
      amountOut: xylonetAmountOut,
      slippageBps,
      isLoading: isXyloNetLoading,
      error: xylonetError,
      chainId: connectedChainId,
    })
    const unitflowQuote = buildUnitFlowRouteQuote({
      tokenIn,
      tokenOut,
      amountIn,
      amountsOut: unitflowAmountsOut,
      slippageBps,
      isLoading: isUnitFlowLoading,
      error: unitflowError,
    })
    const benchmarkQuote = xylonetQuote.availabilityStatus === 'available' && xylonetQuote.healthStatus === 'healthy'
      ? xylonetQuote
      : unitflowQuote.availabilityStatus === 'available' && unitflowQuote.healthStatus === 'healthy'
        ? unitflowQuote
        : undefined
    const cocoStableQuote = ROUTER_SHADOW_MODE_CONFIG.nativeStable.quoteOnly
      ? buildCocoStableShadowRouteQuote({
          tokenIn,
          tokenOut,
          amountIn,
          amountOut: cocoStableAmountOut,
          slippageBps,
          benchmarkQuote,
          isLoading: isCocoStableLoading,
          error: cocoStableError,
          nowMs: quoteTimestamp,
        })
      : undefined
    const baseQuotes = [
      cocoQuote,
      cocoStableQuote,
      xylonetQuote,
      unitflowQuote,
      buildSynthraRouteQuote({
        tokenIn,
        tokenOut,
        amountIn,
        feeQuotes: [
          { fee: 500, amountOut: synthraFee500AmountOut },
          { fee: 3_000, amountOut: synthraFee3000AmountOut },
          { fee: 10_000, amountOut: synthraFee10000AmountOut },
        ],
        slippageBps,
        isLoading: isSynthraLoading,
        error: synthraError,
        chainId: connectedChainId,
      }),
    ].filter((quote): quote is RouteQuote => Boolean(quote))

    const selectableQuotes = baseQuotes.filter((quote) => quote.availabilityStatus === 'available' && quote.executionStatus === 'executable' && quote.amountOut > BigInt(0))

    const bestQuote = selectableQuotes.reduce<RouteQuote | undefined>((best, quote) => {
      if (!best || quote.amountOut > best.amountOut) return quote
      return best
    }, undefined)

    const quotes = baseQuotes.map((quote) => {
      if (quote.source !== 'coco' || quote.availabilityStatus !== 'available' || quote.executionStatus !== 'executable' || !bestQuote || bestQuote.source === 'coco' || quote.amountOut <= BigInt(0)) {
        return quote
      }

      const improvementBps = ((bestQuote.amountOut - quote.amountOut) * BigInt(10_000)) / quote.amountOut
      if (improvementBps <= BETTER_ROUTE_WARNING_THRESHOLD_BPS) return quote

      return {
        ...quote,
        warning: 'Coco pool is currently imbalanced. Better route may be available.',
      }
    })

    // Auto best-route selection (pure helper). Ranks by highest minReceived
    // among executable, healthy, fresh, available routes. Anti-flap keeps the
    // currently-selected route unless a new best improves minReceived by >= 1bp.
    // Never selects the stable pool route while nativeStable.execute is false.
    const selection = selectBestRoute({
      quotes,
      nowMs: quoteTimestamp,
      previousSelectedId: selectedQuoteId,
      antiFlapBps: 1,
    })

    return {
      quotes,
      bestQuote: selection.bestRoute,
      alternativeRoutes: selection.alternativeRoutes,
      blockedRoutes: selection.blockedRoutes,
      noExecutableRouteReason: selection.reason,
      // The default selected route IS the best executable route (auto-select).
      selectedQuote: selection.bestRoute,
      isLoading: isXyloNetLoading || isUnitFlowLoading || isSynthraLoading || isCocoStableLoading,
      xylonetError,
      unitflowError,
      synthraError,
      cocoStableError,
      comingSoonSources: [],
    }
  }, [
    amountIn,
    quoteTimestamp,
    reserveEurc,
    reserveUsdc,
    slippageBps,
    tokenIn,
    tokenOut,
    xylonetAmountOut,
    isXyloNetLoading,
    xylonetError,
    cocoStableAmountOut,
    isCocoStableLoading,
    cocoStableError,
    unitflowAmountsOut,
    isUnitFlowLoading,
    unitflowError,
    synthraFee500AmountOut,
    synthraFee3000AmountOut,
    synthraFee10000AmountOut,
    isSynthraLoading,
    synthraError,
    connectedChainId,
    selectedQuoteId,
  ])
}
