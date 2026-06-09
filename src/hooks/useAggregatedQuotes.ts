import { useMemo } from 'react'
import { useReadContract } from 'wagmi'
import { arcTestnet } from '@/config/chains'
import { EXTERNAL_DEXES } from '@/config/externalDexes'
import type { Token } from '@/types/token'
import { getCocoRouteQuote } from '@/lib/router/cocoAdapter'
import { buildSynthraRouteQuote, getSynthraV3QuoteRequest, isSynthraPairSupported, SYNTHRA_V3_QUOTER_ABI } from '@/lib/router/synthraAdapter'
import { buildXyloNetRouteQuote, isXyloNetPairSupported, XYLONET_ROUTER_ABI } from '@/lib/router/xylonetAdapter'
import { buildUnitFlowRouteQuote, getUnitFlowV25QuoteRequest, isUnitFlowPairSupported, UNITFLOW_V25_ROUTER_ABI } from '@/lib/router/unitflowAdapter'
import type { RouteQuote } from '@/lib/router/types'
import { isCocoStablePoolExecutableRoute } from '@/lib/router/cocoStablePoolGuard'

type UseAggregatedQuotesParams = {
  tokenIn: Token
  tokenOut: Token
  amountIn: bigint
  reserveUsdc?: bigint
  reserveEurc?: bigint
  slippageBps: number
}

const BETTER_ROUTE_WARNING_THRESHOLD_BPS = BigInt(500)

export function useAggregatedQuotes({
  tokenIn,
  tokenOut,
  amountIn,
  reserveUsdc,
  reserveEurc,
  slippageBps,
}: UseAggregatedQuotesParams) {
  const shouldReadXyloNet = amountIn > BigInt(0) && isXyloNetPairSupported(tokenIn, tokenOut)
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
    // Router resolves the pool internally — only tokenIn, tokenOut, amountIn are needed.
    args: [tokenIn.address as `0x${string}`, tokenOut.address as `0x${string}`, amountIn],
    chainId: arcTestnet.id,
    query: {
      enabled: shouldReadXyloNet,
      refetchInterval: 15_000,
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
      refetchInterval: 15_000,
    },
  })

  const synthraQuoteArgs = (fee: 500 | 3_000 | 10_000) => [{
    tokenIn: synthraQuoteRequest?.tokenIn ?? synthra.supportedTokens.USDC,
    tokenOut: synthraQuoteRequest?.tokenOut ?? synthra.supportedTokens.EURC,
    amountIn: synthraQuoteRequest?.amountIn ?? BigInt(0),
    fee,
    sqrtPriceLimitX96: BigInt(0),
  }] as const

  const { data: synthraFee500AmountOut, isLoading: isSynthraFee500Loading, error: synthraFee500Error } = useReadContract({
    address: synthra.v3.quoterAddress,
    abi: SYNTHRA_V3_QUOTER_ABI,
    functionName: 'quoteExactInputSingle',
    args: synthraQuoteArgs(500),
    chainId: arcTestnet.id,
    query: {
      enabled: shouldReadSynthra,
      refetchInterval: 15_000,
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
      refetchInterval: 15_000,
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
      refetchInterval: 15_000,
    },
  })

  const isSynthraLoading = isSynthraFee500Loading || isSynthraFee3000Loading || isSynthraFee10000Loading
  const synthraError = synthraFee500Error && synthraFee3000Error && synthraFee10000Error
    ? synthraFee500Error
    : undefined

  return useMemo(() => {
    const includeCocoStablePoolRoute = isCocoStablePoolExecutableRoute()
    const baseQuotes = [
      getCocoRouteQuote({ tokenIn, tokenOut, amountIn, reserveUsdc, reserveEurc, slippageBps }),
      buildXyloNetRouteQuote({
        tokenIn,
        tokenOut,
        amountIn,
        amountOut: xylonetAmountOut,
        slippageBps,
        isLoading: isXyloNetLoading,
        error: xylonetError,
      }),
      buildUnitFlowRouteQuote({
        tokenIn,
        tokenOut,
        amountIn,
        amountsOut: unitflowAmountsOut,
        slippageBps,
        isLoading: isUnitFlowLoading,
        error: unitflowError,
      }),
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
      }),
    ].filter((quote): quote is RouteQuote => {
      if (!quote) return false
      return includeCocoStablePoolRoute || quote.id !== 'coco-stable-usdc-eurc-v1'
    })

    const selectableQuotes = baseQuotes.filter((quote) => quote.availabilityStatus === 'available' && quote.amountOut > BigInt(0))

    const bestQuote = selectableQuotes.reduce<RouteQuote | undefined>((best, quote) => {
      if (!best || quote.amountOut > best.amountOut) return quote
      return best
    }, undefined)

    const quotes = baseQuotes.map((quote) => {
      if (quote.source !== 'coco' || quote.availabilityStatus !== 'available' || !bestQuote || bestQuote.source === 'coco' || quote.amountOut <= BigInt(0)) {
        return quote
      }

      const improvementBps = ((bestQuote.amountOut - quote.amountOut) * BigInt(10_000)) / quote.amountOut
      if (improvementBps <= BETTER_ROUTE_WARNING_THRESHOLD_BPS) return quote

      return {
        ...quote,
        warning: 'Coco pool is currently imbalanced. Better route may be available.',
      }
    })

    return {
      quotes,
      bestQuote,
      selectedQuote: quotes.find((quote) => quote.source === 'coco' && quote.availabilityStatus === 'available') ?? bestQuote,
      isLoading: isXyloNetLoading || isUnitFlowLoading || isSynthraLoading,
      xylonetError,
      unitflowError,
      synthraError,
      comingSoonSources: [],
    }
  }, [
    amountIn,
    reserveEurc,
    reserveUsdc,
    slippageBps,
    tokenIn,
    tokenOut,
    xylonetAmountOut,
    isXyloNetLoading,
    xylonetError,
    unitflowAmountsOut,
    isUnitFlowLoading,
    unitflowError,
    synthraFee500AmountOut,
    synthraFee3000AmountOut,
    synthraFee10000AmountOut,
    isSynthraLoading,
    synthraError,
  ])
}
