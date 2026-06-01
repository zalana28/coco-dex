import { useMemo } from 'react'
import { useReadContract } from 'wagmi'
import { arcTestnet } from '@/config/chains'
import { EXTERNAL_DEXES } from '@/config/externalDexes'
import type { Token } from '@/types/token'
import { getCocoRouteQuote } from '@/lib/router/cocoAdapter'
import { buildXyloNetRouteQuote, isXyloNetPairSupported, XYLONET_ROUTER_ABI } from '@/lib/router/xylonetAdapter'
import { buildUnitFlowRouteQuote, getUnitFlowV25QuoteRequest, isUnitFlowPairSupported, UNITFLOW_V25_ROUTER_ABI } from '@/lib/router/unitflowAdapter'
import type { RouteQuote } from '@/lib/router/types'

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
  const unitflowQuoteRequest = useMemo(() => getUnitFlowV25QuoteRequest(tokenIn, tokenOut, amountIn), [amountIn, tokenIn, tokenOut])
  const shouldReadUnitFlow = amountIn > BigInt(0) && isUnitFlowPairSupported(tokenIn, tokenOut) && Boolean(unitflowQuoteRequest)

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

  return useMemo(() => {
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
    ].filter((quote): quote is RouteQuote => Boolean(quote))

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
      isLoading: isXyloNetLoading || isUnitFlowLoading,
      xylonetError,
      unitflowError,
      comingSoonSources: [
        // Synthra requires verified router/quoter contract details before integration.
        { source: 'synthra' as const, label: 'Synthra' },
      ],
    }
  }, [amountIn, reserveEurc, reserveUsdc, slippageBps, tokenIn, tokenOut, xylonetAmountOut, isXyloNetLoading, xylonetError, unitflowAmountsOut, isUnitFlowLoading, unitflowError])
}
