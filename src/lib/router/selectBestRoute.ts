import { ROUTER_SHADOW_MODE_CONFIG } from './routerConfig'
import type { RouteQuote, RouteQuoteSource } from './types'

/**
 * Pure best-route selection for the Coco DEX swap aggregator.
 *
 * Single source of truth: the SAME result from `selectBestRoute` drives the
 * "Best route" badge, automatic selection, the selected-route panel, the Swap
 * button provider, the confirmation dialog provider, and the transaction
 * execution provider. The UI must never re-derive Best route independently.
 *
 * Ranking primary key is `minAmountOut` (minReceived), NOT gross `amountOut`.
 * Rationale: `minReceived` reflects the user's configured slippage protection,
 * which is the value actually enforced at execution. Two routes can have
 * similar gross output but different minReceived after slippage; the user
 * cares about the guaranteed minimum.
 *
 * Tie-breakers (in order):
 *   1. higher expected output (amountOut)
 *   2. lower estimated gas when comparable (not yet populated by adapters)
 *   3. lower price impact (not yet populated by adapters)
 *   4. deterministic source priority
 *
 * Anti-flapping threshold: when the currently-selected route is still valid,
 * auto-switch only when the new best route improves minReceived by >= 1 basis
 * point. When the selected route becomes unavailable/stale, switch immediately
 * regardless of threshold (handled by the caller via `previousSelectedId`).
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
  /**
   * The route currently selected (if any). Used for anti-flapping: when the
   * selected route is still valid, we keep it unless the new best improves
   * minReceived by at least `antiFlapBps`.
   */
  previousSelectedId?: string
  /** Anti-flapping threshold in basis points. Default 1bp. */
  antiFlapBps?: number
}

export type NoExecutableRouteReason =
  | 'No routes returned'
  | 'No executable route available for this amount'

export type SelectBestRouteResult = {
  /** Highest-minReceived executable route, or undefined when none qualify. */
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

/** Output value used for ranking: minReceived (slippage-protected minimum). */
function getRankingOutput(quote: RouteQuote): bigint {
  // minAmountOut reflects configured slippage protection — the value actually
  // enforced at execution. Rank by this, not gross amountOut.
  return quote.minAmountOut > BigInt(0) ? quote.minAmountOut : quote.amountOut
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
  if (quote.minAmountOut <= 0n) return 'No minimum received'
  if (isQuoteStale(quote, nowMs)) return 'Quote stale'
  return null
}

/** Sort executable routes best-first: highest ranking output, then source priority, then id. */
function compareExecutable(a: RouteQuote, b: RouteQuote): number {
  const aOut = getRankingOutput(a)
  const bOut = getRankingOutput(b)
  if (aOut !== bOut) return aOut > bOut ? -1 : 1
  if (a.amountOut !== b.amountOut) return a.amountOut > b.amountOut ? -1 : 1
  const aPriority = SOURCE_PRIORITY[a.source] ?? 50
  const bPriority = SOURCE_PRIORITY[b.source] ?? 50
  if (aPriority !== bPriority) return aPriority - bPriority
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Decide whether to switch from `current` to `candidate` given the
 * anti-flapping threshold. Returns the route that should be selected.
 *
 * - If `current` is no longer executable, switch to `candidate` immediately.
 * - If `current` is still executable and `candidate` is better by >= antiFlapBps,
 *   switch.
 * - Otherwise keep `current` (anti-flap).
 */
function applyAntiFlap(
  current: RouteQuote | undefined,
  candidate: RouteQuote | undefined,
  antiFlapBps: number,
): RouteQuote | undefined {
  if (!candidate) return current
  if (!current) return candidate

  const currentOut = getRankingOutput(current)
  const candidateOut = getRankingOutput(candidate)
  if (candidateOut <= currentOut) return current

  if (currentOut <= BigInt(0)) return candidate
  const improvementBps = Number(((candidateOut - currentOut) * BigInt(10_000)) / currentOut)
  if (improvementBps >= antiFlapBps) return candidate
  return current
}

export function selectBestRoute({
  quotes,
  nowMs = Date.now(),
  previousSelectedId,
  antiFlapBps = 1,
}: SelectBestRouteParams): SelectBestRouteResult {
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

  const [rawBest] = executable

  // Safety assertion: the stable pool route must never be the best executable
  // route while execution is disabled. Defends against future filter regressions.
  if (
    rawBest &&
    rawBest.source === 'coco_stable' &&
    !ROUTER_SHADOW_MODE_CONFIG.nativeStable.execute
  ) {
    return {
      bestRoute: undefined,
      alternativeRoutes: [],
      blockedRoutes: quotes.map((q) => ({ ...q, exclusionReason: 'Quote-only beta' })),
      reason: 'No executable route available for this amount',
    }
  }

  // Anti-flapping: if the previously-selected route is still executable, only
  // switch when the new best improves minReceived by >= antiFlapBps.
  const previousSelected = executable.find((q) => q.id === previousSelectedId)
  const bestRoute = applyAntiFlap(previousSelected, rawBest, antiFlapBps)

  if (!bestRoute) {
    return {
      bestRoute: undefined,
      alternativeRoutes: [],
      blockedRoutes: blocked,
      reason: 'No executable route available for this amount',
    }
  }

  const finalAlternatives = executable.filter((q) => q.id !== bestRoute.id)

  return { bestRoute, alternativeRoutes: finalAlternatives, blockedRoutes: blocked }
}
