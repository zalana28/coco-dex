import { describe, expect, it } from 'vitest'
import { EURC, USDC } from '@/config/tokens'
import { selectBestRoute, isQuoteStale } from './selectBestRoute'
import { ROUTER_SHADOW_MODE_CONFIG } from './routerConfig'
import type { RouteQuote, RouteQuoteSource } from './types'

const NOW = 1_700_000_000_000

function makeQuote(overrides: Partial<RouteQuote> & { source: RouteQuoteSource; amountOut: bigint }): RouteQuote {
  const { source, amountOut } = overrides
  const base: RouteQuote = {
    id: `${source}-route`,
    source,
    label: source,
    inputToken: USDC,
    outputToken: EURC,
    amountIn: 1_000_000n,
    amountOut,
    amountOutFormatted: amountOut.toString(),
    minAmountOut: (amountOut * 9_950n) / 10_000n,
    routePath: [USDC.symbol, EURC.symbol],
    quoteTimestamp: NOW,
    ttlMs: 30_000,
    healthStatus: 'healthy',
    warnings: [],
    isExecutable: true,
    executable: true,
    availabilityStatus: 'available',
    executionStatus: 'executable',
  }
  return { ...base, ...overrides }
}

describe('selectBestRoute', () => {
  it('selects the highest amountOut among executable routes', () => {
    const result = selectBestRoute({
      quotes: [
        makeQuote({ source: 'coco', id: 'coco', amountOut: 990_000n }),
        makeQuote({ source: 'xylonet', id: 'xylonet', amountOut: 999_000n }),
        makeQuote({ source: 'unitflow', id: 'unitflow', amountOut: 995_000n }),
      ],
      nowMs: NOW,
    })
    expect(result.bestRoute?.id).toBe('xylonet')
    expect(result.alternativeRoutes.map((r) => r.id)).toEqual(['unitflow', 'coco'])
    expect(result.reason).toBeUndefined()
  })

  it('ignores non-executable routes', () => {
    const result = selectBestRoute({
      quotes: [
        makeQuote({ source: 'xylonet', id: 'xylonet', amountOut: 999_000n, executionStatus: 'non_executable', isExecutable: false, executable: false }),
        makeQuote({ source: 'coco', id: 'coco', amountOut: 990_000n }),
      ],
      nowMs: NOW,
    })
    expect(result.bestRoute?.id).toBe('coco')
    expect(result.blockedRoutes.some((r) => r.id === 'xylonet')).toBe(true)
  })

  it('ignores quote-only routes', () => {
    const result = selectBestRoute({
      quotes: [
        makeQuote({ source: 'coco', id: 'coco', amountOut: 990_000n }),
        makeQuote({ source: 'unitflow', id: 'unitflow', amountOut: 999_000n, executionStatus: 'non_executable', executable: false, isExecutable: false, blockedReason: 'Quote-only beta' }),
      ],
      nowMs: NOW,
    })
    expect(result.bestRoute?.id).toBe('coco')
  })

  it('ignores shadow-only (coco_stable) routes even with the best output', () => {
    const result = selectBestRoute({
      quotes: [
        makeQuote({ source: 'coco_stable', id: 'stable', amountOut: 999_999n, executionStatus: 'non_executable', executable: false, isExecutable: false }),
        makeQuote({ source: 'coco', id: 'coco', amountOut: 990_000n }),
      ],
      nowMs: NOW,
    })
    expect(result.bestRoute?.id).toBe('coco')
    expect(result.blockedRoutes.some((r) => r.id === 'stable')).toBe(true)
  })

  it('ignores stale routes', () => {
    const result = selectBestRoute({
      quotes: [
        makeQuote({ source: 'xylonet', id: 'xylonet', amountOut: 999_000n, quoteTimestamp: NOW - 60_000, ttlMs: 30_000 }),
        makeQuote({ source: 'coco', id: 'coco', amountOut: 990_000n }),
      ],
      nowMs: NOW,
    })
    expect(result.bestRoute?.id).toBe('coco')
    expect(result.blockedRoutes.find((r) => r.id === 'xylonet')?.exclusionReason).toBe('Quote stale')
  })

  it('ignores blocked / unhealthy routes', () => {
    const result = selectBestRoute({
      quotes: [
        makeQuote({ source: 'xylonet', id: 'xylonet', amountOut: 999_000n, healthStatus: 'degraded' }),
        makeQuote({ source: 'coco', id: 'coco', amountOut: 990_000n }),
      ],
      nowMs: NOW,
    })
    expect(result.bestRoute?.id).toBe('coco')
    expect(result.blockedRoutes.find((r) => r.id === 'xylonet')?.exclusionReason).toBe('Source unhealthy')
  })

  it('ignores routes with missing / zero output', () => {
    const result = selectBestRoute({
      quotes: [
        makeQuote({ source: 'xylonet', id: 'xylonet', amountOut: 0n }),
        makeQuote({ source: 'coco', id: 'coco', amountOut: 990_000n }),
      ],
      nowMs: NOW,
    })
    expect(result.bestRoute?.id).toBe('coco')
    expect(result.blockedRoutes.find((r) => r.id === 'xylonet')?.exclusionReason).toBe('No output amount')
  })

  it('returns a no-executable-route reason when all routes are blocked', () => {
    const result = selectBestRoute({
      quotes: [
        makeQuote({ source: 'coco_stable', id: 'stable', amountOut: 999_000n, executionStatus: 'non_executable', executable: false, isExecutable: false }),
        makeQuote({ source: 'xylonet', id: 'xylonet', amountOut: 0n }),
      ],
      nowMs: NOW,
    })
    expect(result.bestRoute).toBeUndefined()
    expect(result.reason).toBe('No executable route available for this amount')
  })

  it('returns "No routes returned" for an empty list', () => {
    const result = selectBestRoute({ quotes: [], nowMs: NOW })
    expect(result.bestRoute).toBeUndefined()
    expect(result.reason).toBe('No routes returned')
  })

  it('never selects Coco Native Stable Pool while execute is false', () => {
    // Guard against the configured invariant we are protecting.
    expect(ROUTER_SHADOW_MODE_CONFIG.nativeStable.execute).toBe(false)
    // Even if the adapter mistakenly marked it executable, the hard guard wins.
    const result = selectBestRoute({
      quotes: [
        makeQuote({ source: 'coco_stable', id: 'stable', amountOut: 999_999n, executionStatus: 'executable', executable: true, isExecutable: true }),
        makeQuote({ source: 'coco', id: 'coco', amountOut: 990_000n }),
      ],
      nowMs: NOW,
    })
    expect(result.bestRoute?.source).toBe('coco')
    expect(result.bestRoute?.source).not.toBe('coco_stable')
  })

  it('uses a deterministic tie-breaker when outputs are equal', () => {
    const quotesA = [
      makeQuote({ source: 'unitflow', id: 'unitflow', amountOut: 990_000n }),
      makeQuote({ source: 'coco', id: 'coco', amountOut: 990_000n }),
      makeQuote({ source: 'xylonet', id: 'xylonet', amountOut: 990_000n }),
    ]
    const resultA = selectBestRoute({ quotes: quotesA, nowMs: NOW })
    // Same set in a different order must produce the same winner (coco priority 0).
    const resultB = selectBestRoute({ quotes: [...quotesA].reverse(), nowMs: NOW })
    expect(resultA.bestRoute?.id).toBe('coco')
    expect(resultB.bestRoute?.id).toBe('coco')
  })
})

describe('isQuoteStale', () => {
  it('is false within TTL and true beyond TTL', () => {
    expect(isQuoteStale({ quoteTimestamp: NOW - 10_000, ttlMs: 30_000 }, NOW)).toBe(false)
    expect(isQuoteStale({ quoteTimestamp: NOW - 40_000, ttlMs: 30_000 }, NOW)).toBe(true)
  })

  it('is never stale when ttl is zero/absent', () => {
    expect(isQuoteStale({ quoteTimestamp: NOW - 999_999, ttlMs: 0 }, NOW)).toBe(false)
  })
})
