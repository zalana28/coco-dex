import { describe, expect, it } from 'vitest'
import { buildUnitFlowRouteQuote, getUnitFlowV25QuoteRequest, isUnitFlowPairSupported } from './unitflowAdapter'
import { USDC, EURC } from '@/config/tokens'

const usdc = USDC
const eurc = EURC
const AMT = 1_000_000n // 1 USDC

describe('isUnitFlowPairSupported', () => {
  it('supports USDC→EURC', () => expect(isUnitFlowPairSupported(usdc, eurc)).toBe(true))
  it('supports EURC→USDC', () => expect(isUnitFlowPairSupported(eurc, usdc)).toBe(true))
  it('rejects same token', () => expect(isUnitFlowPairSupported(usdc, usdc)).toBe(false))
})

describe('getUnitFlowV25QuoteRequest', () => {
  it('returns undefined for zero amount', () => {
    expect(getUnitFlowV25QuoteRequest(usdc, eurc, 0n)).toBeUndefined()
  })

  it('scales USDC input by 1e12 for WUSDC', () => {
    const req = getUnitFlowV25QuoteRequest(usdc, eurc, AMT)
    expect(req).toBeDefined()
    expect(req!.amountIn).toBe(AMT * 1_000_000_000_000n)
  })

  it('does not scale EURC input', () => {
    const req = getUnitFlowV25QuoteRequest(eurc, usdc, AMT)
    expect(req).toBeDefined()
    expect(req!.amountIn).toBe(AMT)
  })
})

describe('buildUnitFlowRouteQuote — liquidity guard', () => {
  it('marks quote available when output is reasonable (within 10×)', () => {
    // Normal healthy pool: 1 USDC in → ~0.73 EURC out
    const quote = buildUnitFlowRouteQuote({
      tokenIn: usdc, tokenOut: eurc, amountIn: AMT,
      amountsOut: [AMT * 1_000_000_000_000n, 730_000n], // [WUSDC in, EURC out]
      slippageBps: 50,
    })
    expect(quote.availabilityStatus).toBe('available')
    expect(quote.amountOut).toBe(730_000n)
    expect(quote.amountOut).toBeGreaterThan(0n)
  })

  it('marks quote unavailable when output is astronomically large (imbalanced pool)', () => {
    // Audit finding: r0(WUSDC)≈0 causes getAmountsOut to return ~1.36e24 EURC raw
    // After normalization by 1e12: 1,362,044,019,318 EURC — clearly broken
    const brokenOutput = 1_362_044_019_318n  // normalized, massively exceeds 10× input
    const quote = buildUnitFlowRouteQuote({
      tokenIn: usdc, tokenOut: eurc, amountIn: AMT,
      amountsOut: [AMT * 1_000_000_000_000n, brokenOutput * 1_000_000_000_000n],
      slippageBps: 50,
    })
    expect(quote.availabilityStatus).toBe('unavailable')
    expect(quote.executionStatus).toBe('non_executable')
    expect(quote.isExecutable).toBe(false)
    expect(quote.amountOut).toBe(0n)
    expect(quote.minAmountOut).toBe(0n)
  })

  it('marks quote unavailable when output is exactly 11× input', () => {
    const quote = buildUnitFlowRouteQuote({
      tokenIn: usdc, tokenOut: eurc, amountIn: AMT,
      amountsOut: [AMT * 1_000_000_000_000n, AMT * 11n], // 11× → exceeds 10× threshold
      slippageBps: 50,
    })
    expect(quote.availabilityStatus).toBe('unavailable')
    expect(quote.isExecutable).toBe(false)
  })

  it('allows output at exactly 10× input (boundary)', () => {
    const quote = buildUnitFlowRouteQuote({
      tokenIn: usdc, tokenOut: eurc, amountIn: AMT,
      amountsOut: [AMT * 1_000_000_000_000n, AMT * 10n], // exactly 10× → within limit
      slippageBps: 50,
    })
    expect(quote.availabilityStatus).toBe('available')
  })

  it('marks unavailable when no quote returned', () => {
    const quote = buildUnitFlowRouteQuote({
      tokenIn: usdc, tokenOut: eurc, amountIn: AMT,
      amountsOut: undefined,
      slippageBps: 50,
    })
    expect(quote.availabilityStatus).toBe('unavailable')
    expect(quote.unavailableReason).toBe('No quote returned')
  })

  it('marks unavailable on contract read error', () => {
    const quote = buildUnitFlowRouteQuote({
      tokenIn: usdc, tokenOut: eurc, amountIn: AMT,
      amountsOut: undefined,
      slippageBps: 50,
      error: new Error('eth_call failed'),
    })
    expect(quote.availabilityStatus).toBe('unavailable')
    expect(quote.unavailableReason).toBe('Contract read failed')
  })

  it('shows loading state while fetching', () => {
    const quote = buildUnitFlowRouteQuote({
      tokenIn: usdc, tokenOut: eurc, amountIn: AMT,
      amountsOut: undefined,
      slippageBps: 50,
      isLoading: true,
    })
    expect(quote.availabilityStatus).toBe('loading')
  })

  it('minAmountOut is 0 for insufficient liquidity quote', () => {
    const brokenOutput = AMT * 1_000_000n  // 1M× input — clearly broken
    const quote = buildUnitFlowRouteQuote({
      tokenIn: usdc, tokenOut: eurc, amountIn: AMT,
      amountsOut: [AMT * 1_000_000_000_000n, brokenOutput * 1_000_000_000_000n],
      slippageBps: 50,
    })
    expect(quote.minAmountOut).toBe(0n)
  })
})

describe('buildUnitFlowRouteQuote — EURC→USDC direction', () => {
  it('marks unavailable (UniversalRouter only supports USDC→EURC direction)', () => {
    // EURC→USDC goes through EURC→WUSDC path; normalized output divides by 1e12
    // which for EURC input would be WUSDC/1e12 = near-zero. Still unavailable
    // because isUnitFlowUniversalRouterExecutable only allows USDC→EURC.
    const quote = buildUnitFlowRouteQuote({
      tokenIn: eurc, tokenOut: usdc, amountIn: AMT,
      amountsOut: [AMT, 900_000n],
      slippageBps: 50,
    })
    // executable = false because only USDC→EURC is supported for execution
    expect(quote.isExecutable).toBe(false)
    expect(quote.executionStatus).toBe('non_executable')
  })
})
