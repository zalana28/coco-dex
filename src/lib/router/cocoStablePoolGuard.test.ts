import { describe, expect, it } from 'vitest'
import { COCO_STABLE_POOL_ROUTING_ENABLED, evaluateNativeStableRouteGuard, isCocoStablePoolExecutableRoute } from './cocoStablePoolGuard'

const nowMs = 1_700_000_000_000
const healthyQuote = {
  amountIn: 100_000n,
  amountOut: 99_860n,
  quoteTimestamp: nowMs,
  ttlMs: 30_000,
  healthStatus: 'healthy' as const,
}
const healthyBenchmark = {
  amountOut: 99_900n,
  availabilityStatus: 'available' as const,
  healthStatus: 'healthy' as const,
}

describe('CocoStablePool routing guard', () => {
  it('keeps CocoStablePool out of executable smart routes for the beta branch', () => {
    expect(COCO_STABLE_POOL_ROUTING_ENABLED).toBe(false)
    expect(isCocoStablePoolExecutableRoute()).toBe(false)
  })

  it('blocks native stable execution when execute=false even with a fresh healthy quote', () => {
    const result = evaluateNativeStableRouteGuard({
      quote: healthyQuote,
      benchmarkQuote: healthyBenchmark,
      nowMs,
      simulationStatus: 'passed',
      executeEnabled: false,
    })

    expect(result.executable).toBe(false)
    expect(result.blockedReason).toBe('Quote-only beta')
  })

  it('rejects stale native stable quotes', () => {
    const result = evaluateNativeStableRouteGuard({
      quote: healthyQuote,
      benchmarkQuote: healthyBenchmark,
      nowMs: nowMs + 30_001,
      simulationStatus: 'passed',
      executeEnabled: true,
    })

    expect(result.executable).toBe(false)
    expect(result.blockedReason).toBe('Quote stale')
  })

  it('blocks native stable execution without a benchmark', () => {
    const result = evaluateNativeStableRouteGuard({
      quote: healthyQuote,
      nowMs,
      simulationStatus: 'passed',
      executeEnabled: true,
    })

    expect(result.executable).toBe(false)
    expect(result.blockedReason).toBe('Benchmark unavailable')
  })

  it('blocks native stable execution above the beta input cap', () => {
    const result = evaluateNativeStableRouteGuard({
      quote: { ...healthyQuote, amountIn: 1_000_001n },
      benchmarkQuote: healthyBenchmark,
      nowMs,
      simulationStatus: 'passed',
      executeEnabled: true,
      maxInputCapAmount: 1_000_000n,
    })

    expect(result.executable).toBe(false)
    expect(result.blockedReason).toBe('Input above beta cap')
  })

  it('blocks native stable execution when benchmark deviation is too high', () => {
    const result = evaluateNativeStableRouteGuard({
      quote: { ...healthyQuote, amountOut: 80_000n },
      benchmarkQuote: healthyBenchmark,
      nowMs,
      simulationStatus: 'passed',
      executeEnabled: true,
      maxDeviationBps: 250,
    })

    expect(result.executable).toBe(false)
    expect(result.blockedReason).toBe('Benchmark deviation too high')
  })
})
