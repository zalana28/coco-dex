import { useEffect, useMemo, useState } from 'react'
import { useChainId, useReadContract } from 'wagmi'
import { arcTestnet } from '@/config/chains'
import { EXTERNAL_DEXES } from '@/config/externalDexes'
import type { Token } from '@/types/token'
import { getCocoRouteQuote } from '@/lib/router/cocoAdapter'
import { buildCocoStableShadowRouteQuote } from '@/lib/router/cocoStableAdapter'
import { buildSynthraRouteQuote, getSynthraV3QuoteRequest, isSynthraPairSupported, SYNTHRA_V3_QUOTER_ABI } from '@/lib/router/synthraAdapter'
import { buildXyloNetRouteQuote, isXyloNetPairSupported, XYLONET_ROUTER_ABI } from '@/lib/router/xylonetAdapter'
import { buildUnitFlowRouteQuote, getUnitFlowV25QuoteRequest, isUnitFlowPairSupported, UNITFLOW_V25_ROUTER_ABI } from '@/lib/router/unitflowAdapter'
import type { RouteQuote } from '@/lib/router/types'
import { ROUTER_SHADOW_MODE_CONFIG } from '@/lib/router/routerConfig'
import { selectBestRoute } from '@/lib/router/selectBestRoute'
import { buildQuoteQueryOptions } from '@/lib/router/quoteQueryOptions'
import { useRpcCircuitBreaker } from '@/hooks/useRpcCircuitBreaker'
import {
  getPairKey,
  getWinningSynthraFee,
  recordWinningSynthraFee,
  selectWinningSynthraFee,
  type SynthraFee,
} from '@/lib/router/synthraFeeCache'

type UseAggregatedQuotesParams = {
  tokenIn: Token
  tokenOut: Token
  amountIn: bigint
  reserveUsdc?: bigint
  reserveEurc?: bigint
  slippageBps: number
  selectedQuoteId?: string
  /** Live clock timestamp (ms). When provided, quotes are checked for staleness
   *  against this clock instead of a frozen mount-time value.
   *  Pass the ticking `clockMs` from SwapPage to keep TTL checks live. */
  nowMs?: number
  /** Suspend polling while a transaction is in flight. Approve and swap
   *  otherwise compete for RPC budget with the background quote pollers, which
   *  is the main source of 429s during a swap. Existing quote data is retained
   *  while paused, so the UI does not go blank. */
  pausePolling?: boolean
  /** Whether the user has the "all routes" panel open. Synthra's three fee
   *  tiers are only worth polling together when they are actually on screen —
   *  see `src/lib/router/synthraFeeCache.ts`. */
  showAllRoutes?: boolean
  /** When the pair reserves were last read (react-query `dataUpdatedAt` from
   *  `usePairReserves`). The Coco quote is computed from those reserves, so its
   *  freshness is theirs. */
  reservesUpdatedAt?: number
}

const BETTER_ROUTE_WARNING_THRESHOLD_BPS = BigInt(500)

export function useAggregatedQuotes({
  tokenIn,
  tokenOut,
  amountIn,
  reserveUsdc,
  reserveEurc,
  slippageBps,
  selectedQuoteId,
  nowMs: externalNowMs,
  pausePolling = false,
  showAllRoutes = false,
  reservesUpdatedAt = 0,
}: UseAggregatedQuotesParams) {
  const connectedChainId = useChainId()
  // Reactive clock for TTL checks: use external clock (from SwapPage) if provided,
  // otherwise maintain an internal ticking clock for standalone usage.
  const [internalNowMs, setInternalNowMs] = useState(() => Date.now())
  const hasExternalClock = externalNowMs !== undefined && externalNowMs > 0
  useEffect(() => {
    if (!hasExternalClock) {
      const id = window.setInterval(() => setInternalNowMs(Date.now()), 5_000)
      return () => window.clearInterval(id)
    }
  }, [hasExternalClock])
  const quoteTimestamp = hasExternalClock ? externalNowMs : internalNowMs
  const shouldReadXyloNet = amountIn > BigInt(0) && isXyloNetPairSupported(tokenIn, tokenOut)
  const xylonet = EXTERNAL_DEXES.xylonet
  const unitflow = EXTERNAL_DEXES.unitflow
  const synthra = EXTERNAL_DEXES.synthra
  const unitflowQuoteRequest = useMemo(() => getUnitFlowV25QuoteRequest(tokenIn, tokenOut, amountIn), [amountIn, tokenIn, tokenOut])
  const synthraQuoteRequest = useMemo(() => getSynthraV3QuoteRequest(tokenIn, tokenOut, amountIn), [amountIn, tokenIn, tokenOut])
  const shouldReadUnitFlow = amountIn > BigInt(0) && isUnitFlowPairSupported(tokenIn, tokenOut) && Boolean(unitflowQuoteRequest)
  const shouldReadSynthra = amountIn > BigInt(0) && isSynthraPairSupported(tokenIn, tokenOut) && Boolean(synthraQuoteRequest)

  const pairKey = getPairKey(tokenIn.address, tokenOut.address)
  const activeSynthraFee = getWinningSynthraFee(pairKey)
  const shouldReadSynthraFee = (fee: SynthraFee) =>
    shouldReadSynthra && (showAllRoutes || fee === activeSynthraFee)

  // Polling is suspended by an in-flight transaction or by the circuit breaker.
  // The breaker reads from a store outside React, so it can gate the very reads
  // that feed it without any ordering trick.
  const breaker = useRpcCircuitBreaker(quoteTimestamp)
  const paused = pausePolling || breaker.isOpen

  const { data: xylonetAmountOut, dataUpdatedAt: xylonetUpdatedAt, isLoading: isXyloNetLoading, error: xylonetError } = useReadContract({
    address: xylonet.routerAddress,
    abi: XYLONET_ROUTER_ABI,
    functionName: 'getAmountOut',
    args: [tokenIn.address as `0x${string}`, tokenOut.address as `0x${string}`, amountIn],
    chainId: arcTestnet.id,
    query: buildQuoteQueryOptions(shouldReadXyloNet, paused, 'xylonet'),
  })

  // CocoStable Pool getAmountOut is not available on the deployed contract
  // (audit 2026-07: all view functions except paused/lpToken/token0/token1 revert).
  // Shadow quote is disabled until the contract ABI is confirmed.
  const cocoStableAmountOut: bigint | undefined = undefined
  const isCocoStableLoading = false
  const cocoStableError: Error | null = null

  const { data: unitflowAmountsOut, dataUpdatedAt: unitflowUpdatedAt, isLoading: isUnitFlowLoading, error: unitflowError } = useReadContract({
    address: unitflow.v25.swapRouterAddress,
    abi: UNITFLOW_V25_ROUTER_ABI,
    functionName: 'getAmountsOut',
    args: [unitflowQuoteRequest?.amountIn ?? BigInt(0), unitflowQuoteRequest?.path ?? [unitflow.v25.wusdcAddress, unitflow.v25.wusdcAddress]],
    chainId: arcTestnet.id,
    query: buildQuoteQueryOptions(shouldReadUnitFlow, paused, 'unitflow'),
  })

  // Flat args matching verified on-chain ABI: (tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96)
  // Returns tuple: [amountOut, sqrtPriceX96After, initializedTicksCrossed, gasEstimate]
  const synthraQuoteArgs = (fee: 500 | 3_000 | 10_000) => [
    synthraQuoteRequest?.tokenIn ?? synthra.supportedTokens.USDC,
    synthraQuoteRequest?.tokenOut ?? synthra.supportedTokens.EURC,
    synthraQuoteRequest?.amountIn ?? BigInt(0),
    fee,
    BigInt(0),
  ] as const

  const { data: synthraFee500AmountOut, dataUpdatedAt: synthraFee500UpdatedAt, isLoading: isSynthraFee500Loading, error: synthraFee500Error } = useReadContract({
    address: synthra.v3.quoterAddress,
    abi: SYNTHRA_V3_QUOTER_ABI,
    functionName: 'quoteExactInputSingle',
    args: synthraQuoteArgs(500),
    chainId: arcTestnet.id,
    query: buildQuoteQueryOptions(shouldReadSynthraFee(500), paused, 'synthra'),
  })

  const { data: synthraFee3000AmountOut, dataUpdatedAt: synthraFee3000UpdatedAt, isLoading: isSynthraFee3000Loading, error: synthraFee3000Error } = useReadContract({
    address: synthra.v3.quoterAddress,
    abi: SYNTHRA_V3_QUOTER_ABI,
    functionName: 'quoteExactInputSingle',
    args: synthraQuoteArgs(3_000),
    chainId: arcTestnet.id,
    query: buildQuoteQueryOptions(shouldReadSynthraFee(3_000), paused, 'synthra'),
  })

  const { data: synthraFee10000AmountOut, dataUpdatedAt: synthraFee10000UpdatedAt, isLoading: isSynthraFee10000Loading, error: synthraFee10000Error } = useReadContract({
    address: synthra.v3.quoterAddress,
    abi: SYNTHRA_V3_QUOTER_ABI,
    functionName: 'quoteExactInputSingle',
    args: synthraQuoteArgs(10_000),
    chainId: arcTestnet.id,
    query: buildQuoteQueryOptions(shouldReadSynthraFee(10_000), paused, 'synthra'),
  })

  const isSynthraLoading = isSynthraFee500Loading || isSynthraFee3000Loading || isSynthraFee10000Loading
  const synthraError = synthraFee500Error && synthraFee3000Error && synthraFee10000Error
    ? synthraFee500Error
    : undefined

  // Remember which fee tier actually wins for this pair, so the continuous poll
  // tracks liquidity instead of always defaulting to the lowest tier. Only tiers
  // that were actually read contribute, so this is a no-op while a single tier
  // is being polled.
  const unwrapAmountOut = (v: unknown) => (Array.isArray(v) ? (v[0] as bigint | undefined) : (v as bigint | undefined))
  const winningFee = selectWinningSynthraFee({
    500: unwrapAmountOut(synthraFee500AmountOut),
    3_000: unwrapAmountOut(synthraFee3000AmountOut),
    10_000: unwrapAmountOut(synthraFee10000AmountOut),
  })
  if (winningFee) recordWinningSynthraFee(pairKey, winningFee)

  // Freshness is that of the *oldest* contributing read — the conservative
  // choice. Since only the winning tier is polled continuously, this is usually
  // a single value. Zero means "never fetched", so it is excluded rather than
  // treated as 1970.
  const synthraReadTimes = [synthraFee500UpdatedAt, synthraFee3000UpdatedAt, synthraFee10000UpdatedAt].filter((t) => t > 0)
  const synthraUpdatedAt = synthraReadTimes.length > 0 ? Math.min(...synthraReadTimes) : 0

  return useMemo(() => {
    const cocoQuote = getCocoRouteQuote({ tokenIn, tokenOut, amountIn, reserveUsdc, reserveEurc, slippageBps, quotedAt: reservesUpdatedAt })
    const xylonetQuote = buildXyloNetRouteQuote({
      tokenIn,
      tokenOut,
      amountIn,
      amountOut: xylonetAmountOut,
      slippageBps,
      isLoading: isXyloNetLoading,
      error: xylonetError,
      chainId: connectedChainId,
      quotedAt: xylonetUpdatedAt,
    })
    const unitflowQuote = buildUnitFlowRouteQuote({
      tokenIn,
      tokenOut,
      amountIn,
      amountsOut: unitflowAmountsOut,
      slippageBps,
      isLoading: isUnitFlowLoading,
      error: unitflowError,
      quotedAt: unitflowUpdatedAt,
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
          { fee: 500, amountOut: Array.isArray(synthraFee500AmountOut) ? synthraFee500AmountOut[0] : synthraFee500AmountOut },
          { fee: 3_000, amountOut: Array.isArray(synthraFee3000AmountOut) ? synthraFee3000AmountOut[0] : synthraFee3000AmountOut },
          { fee: 10_000, amountOut: Array.isArray(synthraFee10000AmountOut) ? synthraFee10000AmountOut[0] : synthraFee10000AmountOut },
        ],
        slippageBps,
        isLoading: isSynthraLoading,
        error: synthraError,
        chainId: connectedChainId,
        quotedAt: synthraUpdatedAt,
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
      /** Open when several sources fail at once — render one banner, not five. */
      rpcOutage: {
        isPaused: breaker.isOpen,
        secondsRemaining: breaker.secondsRemaining,
        retryNow: breaker.retryNow,
      },
    }
  }, [
    breaker.isOpen,
    breaker.secondsRemaining,
    breaker.retryNow,
    amountIn,
    quoteTimestamp,
    reservesUpdatedAt,
    xylonetUpdatedAt,
    unitflowUpdatedAt,
    synthraUpdatedAt,
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
