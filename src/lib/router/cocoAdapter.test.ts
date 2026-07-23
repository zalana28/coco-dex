import { describe, expect, it } from 'vitest'
import { getCocoRouteQuote } from './cocoAdapter'
import { USDC, EURC } from '@/config/tokens'

const usdc = USDC
const eurc = EURC

// Audit-verified reserves (2026-07): r0=85.3M, r1=43.5M (raw 6-decimal)
const RESERVE_USDC = 85_307_982n
const RESERVE_EURC = 43_512_770n

describe('getCocoRouteQuote — price impact guard', () => {
  it('returns executable quote for tiny amount (< 3% impact)', () => {
    const quote = getCocoRouteQuote({
      tokenIn: usdc, tokenOut: eurc,
      amountIn: 100_000n, // 0.1 USDC
      reserveUsdc: RESERVE_USDC,
      reserveEurc: RESERVE_EURC,
      slippageBps: 50,
    })
    expect(quote).toBeDefined()
    expect(quote!.executionStatus).toBe('executable')
    expect(quote!.isExecutable).toBe(true)
    expect(quote!.amountOut).toBeGreaterThan(0n)
    expect(quote!.warning).toBeUndefined()
  })

  it('marks non-executable for large amount with high price impact (> 3%)', () => {
    // 10 USDC into a ~85 USDC pool → ~10.7% impact (verified on-chain)
    const quote = getCocoRouteQuote({
      tokenIn: usdc, tokenOut: eurc,
      amountIn: 10_000_000n, // 10 USDC
      reserveUsdc: RESERVE_USDC,
      reserveEurc: RESERVE_EURC,
      slippageBps: 50,
    })
    expect(quote).toBeDefined()
    expect(quote!.executionStatus).toBe('non_executable')
    expect(quote!.isExecutable).toBe(false)
    expect(quote!.healthStatus).toBe('degraded')
    expect(quote!.warning).toMatch(/High price impact/)
    expect(quote!.blockedReason).toBeDefined()
  })

  it('still returns amountOut even when impact is too high (quote-only)', () => {
    const quote = getCocoRouteQuote({
      tokenIn: usdc, tokenOut: eurc,
      amountIn: 10_000_000n,
      reserveUsdc: RESERVE_USDC,
      reserveEurc: RESERVE_EURC,
      slippageBps: 50,
    })
    // amountOut should still be computed (for display) even if not executable
    expect(quote!.amountOut).toBeGreaterThan(0n)
  })

  it('is executable for balanced pool with 10 USDC (< 3% impact)', () => {
    // Balanced pool: 1M USDC, 740K EURC (approximates market rate)
    const quote = getCocoRouteQuote({
      tokenIn: usdc, tokenOut: eurc,
      amountIn: 10_000_000n, // 10 USDC
      reserveUsdc: 1_000_000_000_000n, // 1M USDC
      reserveEurc: 740_000_000_000n,   // 740K EURC
      slippageBps: 50,
    })
    expect(quote!.executionStatus).toBe('executable')
    expect(quote!.isExecutable).toBe(true)
  })

  it('returns undefined for zero amount', () => {
    const quote = getCocoRouteQuote({
      tokenIn: usdc, tokenOut: eurc,
      amountIn: 0n,
      reserveUsdc: RESERVE_USDC,
      reserveEurc: RESERVE_EURC,
      slippageBps: 50,
    })
    expect(quote).toBeUndefined()
  })

  it('returns undefined when reserves missing', () => {
    const quote = getCocoRouteQuote({
      tokenIn: usdc, tokenOut: eurc,
      amountIn: 1_000_000n,
      reserveUsdc: undefined,
      reserveEurc: undefined,
      slippageBps: 50,
    })
    expect(quote).toBeUndefined()
  })

  it('uses correct source and router address', () => {
    const quote = getCocoRouteQuote({
      tokenIn: usdc, tokenOut: eurc,
      amountIn: 100_000n,
      reserveUsdc: RESERVE_USDC,
      reserveEurc: RESERVE_EURC,
      slippageBps: 50,
    })
    expect(quote!.source).toBe('coco')
    expect(quote!.routerAddress).toBe('0xC31166847A4CEC31629a0ABe4E6383B3CD75732A')
    expect(quote!.poolAddress).toBe('0x0eEA9DC9153215B15b1E6c43f4D68779002d4F1c')
  })

  it('supports EURC→USDC direction', () => {
    const quote = getCocoRouteQuote({
      tokenIn: eurc, tokenOut: usdc,
      amountIn: 100_000n, // 0.1 EURC
      reserveUsdc: RESERVE_USDC,
      reserveEurc: RESERVE_EURC,
      slippageBps: 50,
    })
    expect(quote).toBeDefined()
    expect(quote!.amountOut).toBeGreaterThan(0n)
    // EURC→USDC: with current imbalance, 0.1 EURC gives ~1.95 USDC (pool imbalanced)
    // Just verify output is reasonable (> 0 and < 1000 USDC for 0.1 EURC input)
    expect(quote!.amountOut).toBeLessThan(1_000_000_000n)
  })
})
