import { ROUTER_SHADOW_MODE_CONFIG } from './routerConfig'
import type { RouteQuote, RouteQuoteSource } from './types'

/**
 * Pure best-route selection for the Coco DEX swap aggregator.
 *
 * Gas note: no adapter currently populates `estimatedGas`, so selection ranks
 * by gross `amountOut` (highest output wins). If/when gas estimates exist this
 * helper will rank by net output (`amountOut - gasCostInOutputToken`) — see
 * `getRankingOutput`. Until then, ranking does NOT include gas costs.
 *
 * Stable-pool safety: the Coco Native Stable Pool route (`coco_stable`) is
 * quote-only / shadow-only while `ROUTER_SHADOW_MODE_CONFIG.nativeStable.execute`
 * is false. It is hard-excluded from executable selection here regardless of its
 * reported output, and an assertion guards against it ever being returned as the
 * best executable route.
 */

export type SelectBestRouteParams = {
  quotes: RouteQuote[]
  /** Current time in ms; injectable for deterministic tests. */
  nowMs?: number
}

export type NoExecutableRouteReason =
  | 'No routes returned'
  | 'No executable route available for this amount'

export type SelectBestRouteResult = {
  /** Highest-output executable route, or undefined when none qualify. */
  bestRoute?: RouteQuote
  /** Other executable routes, sorted best-first (excludes bestRoute). */
  alternativeRoutes: RouteQuote[]
  /** Non-executable / blocked / unavailable routes, each with a human reason. */
  blockedRoutes: Array<RouteQuote & { exclusionReason: string }>
  /** Set only when there is no executable route. */
  reason?: NoExecutableRouteReason
}

// Deterministic tie-breaker order when two executable routes have equal output.
// Lower index wins. Coco native first (most trusted / direct pool), then the
// external routers in a stable, documented order.
const SOURCE_PRIORITY: Record<RouteQuoteSource, number> = {
  coco: 0,
  xylonet: 1,
  unitflow: 2,
  synthra: 3,
  coco_stable: 99, // never executable; kept last defensively
}

/** True when the quote's age exceeds its TTL. */
export function isQuoteStale(
  quote: Pick<RouteQuote, 'quoteTimestamp' | 'ttlMs'>,
  nowMs: number,
): boolean {
  if (!quote.ttlMs || quote.ttlMs <= 0) return false
  return nowMs - quote.quoteTimestamp > quote.ttlMs
}

/** Output value used for ranking. Net-of-gas when gas data exists, else gross. */
function getRankingOutput(quote: RouteQuote): bigint {
  // estimatedGas is denominated in gas units, not output token, so we cannot
  // safely subtract it without a gas price + output-token conversion. Until an
  // adapter provides net output, rank by gross amountOut.
  return quote.amountOut
}

/**
 * Reason a route is excluded from executable selection, or null if executable.
 * Order matters: the first failing check is reported.
 */
function getExclusionReason(quote: RouteQuote, nowMs: number): string | null {
  // Hard stable-pool guard: never executable while execute is disabled.
  if (quote.source === 'coco_stable' && !ROUTER_SHADOW_MODE_CONFIG.nativeStable.execute) {
    return quote.blockedReason ?? 'Quote-only beta'
  }
  if (quote.availabilityStatus === 'loading') return 'Loading quote'
  if (quote.availabilityStatus === 'unavailable') return quote.unavailableReason ?? 'Unavailable'
  if (quote.availabilityStatus === 'coming_soon') return 'Coming soon'
  if (quote.availabilityStatus !== 'available') return 'Unavailable'
  if (quote.executionStatus !== 'executable' || !quote.isExecutable || !quote.executable) {
    return quote.blockedReason ?? 'Quote only'
  }
  if (quote.blockedReason) return quote.blockedReason
  if (quote.healthStatus !== 'healthy') return 'Source unhealthy'
  if (quote.amountOut <= 0n) return 'No output amount'
  if (isQuoteStale(quote, nowMs)) return 'Quote stale'
  return null
}

/** Sort executable routes best-first: highest ranking output, then source priority, then id. */
function compareExecutable(a: RouteQuote, b: RouteQuote): number {
  const aOut = getRankingOutput(a)
  const bOut = getRankingOutput(b)
  if (aOut !== bOut) return aOut > bOut ? -1 : 1
  const aPriority = SOURCE_PRIORITY[a.source] ?? 50
  const bPriority = SOURCE_PRIORITY[b.source] ?? 50
  if (aPriority !== bPriority) return aPriority - bPriority
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export function selectBestRoute({ quotes, nowMs = Date.now() }: SelectBestRouteParams): SelectBestRouteResult {
  if (!quotes || quotes.length === 0) {
    return { bestRoute: undefined, alternativeRoutes: [], blockedRoutes: [], reason: 'No routes returned' }
  }

  const executable: RouteQuote[] = []
  const blocked: Array<RouteQuote & { exclusionReason: string }> = []

  for (const quote of quotes) {
    const exclusion = getExclusionReason(quote, nowMs)
    if (exclusion === null) {
      executable.push(quote)
    } else {
      blocked.push({ ...quote, exclusionReason: exclusion })
    }
  }

  executable.sort(compareExecutable)

  const [bestRoute, ...alternativeRoutes] = executable

  // Safety assertion: the stable pool route must never be the best executable
  // route while execution is disabled. Defends against future filter regressions.
  if (
    bestRoute &&
    bestRoute.source === 'coco_stable' &&
    !ROUTER_SHADOW_MODE_CONFIG.nativeStable.execute
  ) {
    return {
      bestRoute: undefined,
      alternativeRoutes: [],
      blockedRoutes: quotes.map((q) => ({ ...q, exclusionReason: 'Quote-only beta' })),
      reason: 'No executable route available for this amount',
    }
  }

  if (!bestRoute) {
    return {
      bestRoute: undefined,
      alternativeRoutes: [],
      blockedRoutes: blocked,
      reason: 'No executable route available for this amount',
    }
  }

  return { bestRoute, alternativeRoutes, blockedRoutes: blocked }
}
