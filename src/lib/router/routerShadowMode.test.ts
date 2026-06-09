import { describe, expect, it } from 'vitest'
import { EURC, USDC } from '@/config/tokens'
import { buildCocoStableShadowRouteQuote } from './cocoStableAdapter'
import { buildUnitFlowRouteQuote } from './unitflowAdapter'
import { buildXyloNetRouteQuote } from './xylonetAdapter'

describe('router shadow mode quotes', () => {
  it('displays native stable shadow quotes but never marks them executable', () => {
    const benchmarkQuote = buildXyloNetRouteQuote({
      tokenIn: USDC,
      tokenOut: EURC,
      amountIn: 100_000n,
      amountOut: 99_900n,
      slippageBps: 50,
    })
    const quote = buildCocoStableShadowRouteQuote({
      tokenIn: USDC,
      tokenOut: EURC,
      amountIn: 100_000n,
      amountOut: 99_860n,
      slippageBps: 50,
      benchmarkQuote,
      nowMs: 1_700_000_000_000,
    })

    expect(quote.source).toBe('coco_stable')
    expect(quote.availabilityStatus).toBe('available')
    expect(quote.executionStatus).toBe('non_executable')
    expect(quote.executable).toBe(false)
    expect(quote.blockedReason).toBe('Simulation missing')
  })

  it('shows a benchmark warning when native stable quote has no benchmark', () => {
    const quote = buildCocoStableShadowRouteQuote({
      tokenIn: USDC,
      tokenOut: EURC,
      amountIn: 100_000n,
      amountOut: 99_860n,
      slippageBps: 50,
      nowMs: 1_700_000_000_000,
    })

    expect(quote.executable).toBe(false)
    expect(quote.blockedReason).toBe('Benchmark unavailable')
    expect(quote.warnings).toContain('Benchmark unavailable')
  })

  it('keeps a healthy XyloNet route executable', () => {
    const quote = buildXyloNetRouteQuote({
      tokenIn: USDC,
      tokenOut: EURC,
      amountIn: 100_000n,
      amountOut: 99_900n,
      slippageBps: 50,
    })

    expect(quote.healthStatus).toBe('healthy')
    expect(quote.executionStatus).toBe('executable')
    expect(quote.executable).toBe(true)
  })

  it('degrades XyloNet adapter failures gracefully', () => {
    const quote = buildXyloNetRouteQuote({
      tokenIn: USDC,
      tokenOut: EURC,
      amountIn: 100_000n,
      slippageBps: 50,
      error: new Error('RPC unavailable'),
    })

    expect(quote.availabilityStatus).toBe('unavailable')
    expect(quote.healthStatus).toBe('unavailable')
    expect(quote.executionStatus).toBe('non_executable')
    expect(quote.unavailableReason).toBe('Contract read failed')
  })

  it('degrades UnitFlow adapter failures gracefully', () => {
    const quote = buildUnitFlowRouteQuote({
      tokenIn: USDC,
      tokenOut: EURC,
      amountIn: 100_000n,
      slippageBps: 50,
      error: new Error('RPC unavailable'),
    })

    expect(quote.availabilityStatus).toBe('unavailable')
    expect(quote.healthStatus).toBe('unavailable')
    expect(quote.executionStatus).toBe('non_executable')
    expect(quote.unavailableReason).toBe('Contract read failed')
  })
})
