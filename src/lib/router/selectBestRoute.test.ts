import { describe, expect, it } from 'vitest'
import { selectBestRoute, isQuoteStale } from './selectBestRoute'
import type { RouteQuote } from './types'

function makeQuote(overrides: Partial<RouteQuote> & Pick<RouteQuote, 'id' | 'source' | 'amountOut' | 'minAmountOut'>): RouteQuote {
  return {
    label: overrides.source,
    inputToken: {} as never,
    outputToken: {} as never,
    amountIn: 100_000n,
    amountOutFormatted: '0',
    routePath: ['A', 'B'],
    quoteTimestamp: Date.now(),
    ttlMs: 30_000,
    healthStatus: 'healthy',
    routerAddress: '0x0000000000000000000000000000000000000000' as `0x${string}`,
    isExecutable: true,
    executable: true,
    availabilityStatus: 'available',
    executionStatus: 'executable',
    ...overrides,
  } as RouteQuote
}

describe('selectBestRoute ranking by minAmountOut', () => {
  it('ranks by minReceived, not gross amountOut', () => {
    const coco = makeQuote({
      id: 'coco', source: 'coco',
      amountOut: 761_490n, minAmountOut: 760_728n,
    })
    const unitflow = makeQuote({
      id: 'unitflow', source: 'unitflow',
      amountOut: 737_076n, minAmountOut: 736_338n,
    })
    const selection = selectBestRoute({ quotes: [unitflow, coco], nowMs: Date.now() })
    expect(selection.bestRoute?.id).toBe('coco')
  })

  it('Coco beats UnitFlow using observed example values', () => {
    const coco = makeQuote({ id: 'coco', source: 'coco', amountOut: 761_490n, minAmountOut: 760_728n })
    const unitflow = makeQuote({ id: 'unitflow', source: 'unitflow', amountOut: 737_076n, minAmountOut: 736_338n })
    const selection = selectBestRoute({ quotes: [unitflow, coco] })
    expect(selection.bestRoute?.id).toBe('coco')
  })

  it('quote-only XyloNet cannot win', () => {
    const xylonet = makeQuote({
      id: 'xylonet', source: 'xylonet', amountOut: 999_000n, minAmountOut: 998_000n,
      isExecutable: false, executable: false, executionStatus: 'non_executable',
      blockedReason: 'Quote-only beta',
    })
    const coco = makeQuote({ id: 'coco', source: 'coco', amountOut: 761_490n, minAmountOut: 760_728n })
    const selection = selectBestRoute({ quotes: [xylonet, coco] })
    expect(selection.bestRoute?.id).toBe('coco')
  })

  it('shadow Coco Native Stable cannot win', () => {
    const stable = makeQuote({
      id: 'coco_stable', source: 'coco_stable', amountOut: 999_000n, minAmountOut: 998_000n,
      isExecutable: false, executable: false, executionStatus: 'non_executable',
      blockedReason: 'Quote-only beta',
    })
    const coco = makeQuote({ id: 'coco', source: 'coco', amountOut: 761_490n, minAmountOut: 760_728n })
    const selection = selectBestRoute({ quotes: [stable, coco] })
    expect(selection.bestRoute?.id).toBe('coco')
  })

  it('unavailable Synthra cannot win', () => {
    const synthra = makeQuote({
      id: 'synthra', source: 'synthra', amountOut: 0n, minAmountOut: 0n,
      availabilityStatus: 'unavailable', unavailableReason: 'No active USDC/EURC pool',
    })
    const coco = makeQuote({ id: 'coco', source: 'coco', amountOut: 761_490n, minAmountOut: 760_728n })
    const selection = selectBestRoute({ quotes: [synthra, coco] })
    expect(selection.bestRoute?.id).toBe('coco')
  })

  it('stale route cannot win', () => {
    const stale = makeQuote({
      id: 'unitflow', source: 'unitflow', amountOut: 999_000n, minAmountOut: 998_000n,
      quoteTimestamp: Date.now() - 60_000, ttlMs: 30_000,
    })
    const coco = makeQuote({ id: 'coco', source: 'coco', amountOut: 761_490n, minAmountOut: 760_728n })
    const selection = selectBestRoute({ quotes: [stale, coco], nowMs: Date.now() })
    expect(selection.bestRoute?.id).toBe('coco')
  })

  it('zero-output route cannot win', () => {
    const zero = makeQuote({
      id: 'unitflow', source: 'unitflow', amountOut: 0n, minAmountOut: 0n,
    })
    const coco = makeQuote({ id: 'coco', source: 'coco', amountOut: 761_490n, minAmountOut: 760_728n })
    const selection = selectBestRoute({ quotes: [zero, coco] })
    expect(selection.bestRoute?.id).toBe('coco')
  })

  it('no valid route clears selection', () => {
    const xylonet = makeQuote({
      id: 'xylonet', source: 'xylonet', amountOut: 999_000n, minAmountOut: 998_000n,
      isExecutable: false, executable: false, executionStatus: 'non_executable',
    })
    const synthra = makeQuote({
      id: 'synthra', source: 'synthra', amountOut: 0n, minAmountOut: 0n,
      availabilityStatus: 'unavailable',
    })
    const selection = selectBestRoute({ quotes: [xylonet, synthra] })
    expect(selection.bestRoute).toBeUndefined()
    expect(selection.reason).toBe('No executable route available for this amount')
  })
})

describe('selectBestRoute anti-flapping', () => {
  it('keeps current valid route when improvement < 1bp', () => {
    const current = makeQuote({ id: 'coco', source: 'coco', amountOut: 761_490n, minAmountOut: 760_728n })
    // New best is only ~0.01bp better (760_800 vs 760_728) — below 1bp threshold.
    const challenger = makeQuote({ id: 'unitflow', source: 'unitflow', amountOut: 761_870n, minAmountOut: 760_800n })
    const selection = selectBestRoute({
      quotes: [current, challenger],
      previousSelectedId: 'coco',
      antiFlapBps: 1,
    })
    expect(selection.bestRoute?.id).toBe('coco')
  })

  it('switches when improvement >= 1bp', () => {
    const current = makeQuote({ id: 'coco', source: 'coco', amountOut: 761_490n, minAmountOut: 760_000n })
    const challenger = makeQuote({ id: 'unitflow', source: 'unitflow', amountOut: 761_490n, minAmountOut: 770_000n })
    const selection = selectBestRoute({
      quotes: [current, challenger],
      previousSelectedId: 'coco',
      antiFlapBps: 1,
    })
    expect(selection.bestRoute?.id).toBe('unitflow')
  })

  it('switches immediately when current becomes unavailable', () => {
    const current = makeQuote({
      id: 'coco', source: 'coco', amountOut: 0n, minAmountOut: 0n,
      availabilityStatus: 'unavailable', unavailableReason: 'No quote returned',
    })
    const challenger = makeQuote({ id: 'unitflow', source: 'unitflow', amountOut: 737_076n, minAmountOut: 736_338n })
    const selection = selectBestRoute({
      quotes: [current, challenger],
      previousSelectedId: 'coco',
      antiFlapBps: 1,
    })
    expect(selection.bestRoute?.id).toBe('unitflow')
  })
})

describe('isQuoteStale', () => {
  it('detects stale quote beyond TTL', () => {
    const quote = { quoteTimestamp: Date.now() - 60_000, ttlMs: 30_000 }
    expect(isQuoteStale(quote, Date.now())).toBe(true)
  })

  it('detects fresh quote within TTL', () => {
    const quote = { quoteTimestamp: Date.now() - 5_000, ttlMs: 30_000 }
    expect(isQuoteStale(quote, Date.now())).toBe(false)
  })
})
