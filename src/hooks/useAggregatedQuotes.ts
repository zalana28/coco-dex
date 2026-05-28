import { useMemo } from 'react'
import { useReadContract } from 'wagmi'
import { arcTestnet } from '@/config/chains'
import { EXTERNAL_DEXES } from '@/config/externalDexes'
import type { Token } from '@/types/token'
import { getCocoRouteQuote } from '@/lib/router/cocoAdapter'
import { buildXyloNetRouteQuote, isXyloNetPairSupported, XYLONET_ROUTER_ABI } from '@/lib/router/xylonetAdapter'
import type { RouteQuote } from '@/lib/router/types'

const ZERO_AMOUNT = BigInt(0)

type UseAggregatedQuotesParams = {
  tokenIn: Token
  tokenOut: Token
  amountIn: bigint
  reserveUsdc?: bigint
  reserveEurc?: bigint
  slippageBps: number
}

const BETTER_ROUTE_WARNING_THRESHOLD_BPS = BigInt(500)

function createComingSoonQuote(source: 'unitflow' | 'synthra', label: string, tokenIn: Token, tokenOut: Token, amountIn: bigint): RouteQuote {
  return {
    id: `${source}-coming-soon`,
    source,
    label,
    amountIn,
    amountOut: ZERO_AMOUNT,
    amountOutFormatted: 'Coming soon',
    minAmountOut: ZERO_AMOUNT,
    routePath: [tokenIn.symbol, tokenOut.symbol],
    isExecutable: false,
    status: 'coming_soon',
    executionStatus: 'non_executable',
    errorMessage: 'Coming soon',
  }
}

export function useAggregatedQuotes({
  tokenIn,
  tokenOut,
  amountIn,
  reserveUsdc,
  reserveEurc,
  slippageBps,
}: UseAggregatedQuotesParams) {
  const shouldReadXyloNet = amountIn > ZERO_AMOUNT && isXyloNetPairSupported(tokenIn, tokenOut)
  const xylonet = EXTERNAL_DEXES.xylonet

  const { data: xylonetAmountOut, isLoading: isXyloNetLoading, error: xylonetError } = useReadContract({
    address: xylonet.routerAddress,
    abi: XYLONET_ROUTER_ABI,
    functionName: 'getAmountOut',
    args: [xylonet.usdcEurcPoolAddress, tokenIn.address as `0x${string}`, tokenOut.address as `0x${string}`, amountIn],
    chainId: arcTestnet.id,
    query: {
      enabled: shouldReadXyloNet,
      refetchInterval: 15_000,
    },
  })

  return useMemo(() => {
    const cocoQuote = getCocoRouteQuote({ tokenIn, tokenOut, amountIn, reserveUsdc, reserveEurc, slippageBps })
    const xylonetQuote = buildXyloNetRouteQuote({
      tokenIn,
      tokenOut,
      amountIn,
      amountOut: xylonetAmountOut,
      slippageBps,
      isLoading: isXyloNetLoading,
      readError: xylonetError,
    })

    const pricedQuotes = [cocoQuote, xylonetQuote].filter((quote): quote is RouteQuote => {
      if (!quote) return false
      return quote.status === 'available' && quote.amountOut > ZERO_AMOUNT
    })

    const bestQuote = pricedQuotes.reduce<RouteQuote | undefined>((best, quote) => {
      if (!best || quote.amountOut > best.amountOut) return quote
      return best
    }, undefined)

    const quotes = [cocoQuote, xylonetQuote]
      .filter((quote): quote is RouteQuote => Boolean(quote))
      .map((quote) => {
        if (quote.source !== 'coco' || !bestQuote || bestQuote.source === 'coco' || quote.amountOut <= ZERO_AMOUNT) {
          return quote
        }

        const improvementBps = ((bestQuote.amountOut - quote.amountOut) * BigInt(10_000)) / quote.amountOut
        if (improvementBps <= BETTER_ROUTE_WARNING_THRESHOLD_BPS) return quote

        return {
          ...quote,
          warning: 'Coco pool is currently imbalanced. Better route may be available.',
        }
      })

    const routeCards = [
      ...quotes,
      createComingSoonQuote('unitflow', 'UnitFlow', tokenIn, tokenOut, amountIn),
      createComingSoonQuote('synthra', 'Synthra', tokenIn, tokenOut, amountIn),
    ]

    return {
      quotes,
      routeCards,
      bestQuote,
      selectedQuote: quotes.find((quote) => quote.source === 'coco') ?? bestQuote,
      isLoading: isXyloNetLoading,
      xylonetError,
    }
  }, [amountIn, reserveEurc, reserveUsdc, slippageBps, tokenIn, tokenOut, xylonetAmountOut, isXyloNetLoading, xylonetError])
}
