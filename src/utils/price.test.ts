import { describe, it, expect } from 'vitest'
import { getAmountOut, getAmountIn, calculatePriceImpact, calculateMinimumReceived } from './price'

describe('getAmountOut', () => {
  it('returns 0 for zero input', () => {
    expect(getAmountOut(BigInt(0), BigInt(1000000), BigInt(1000000))).toBe(BigInt(0))
  })

  it('returns 0 for zero reserves', () => {
    expect(getAmountOut(BigInt(1000), BigInt(0), BigInt(1000000))).toBe(BigInt(0))
    expect(getAmountOut(BigInt(1000), BigInt(1000000), BigInt(0))).toBe(BigInt(0))
  })

  it('calculates correct output with 0.3% fee', () => {
    // 1000 in, reserves 1M/1M, fee 0.3%
    const amountIn = BigInt(1000_000000) // 1000 USDC (6 decimals)
    const reserveIn = BigInt(1000000_000000) // 1M USDC
    const reserveOut = BigInt(920000_000000) // 920K EURC
    const out = getAmountOut(amountIn, reserveIn, reserveOut)
    // Should be slightly less than 920 due to fee and slippage
    expect(out).toBeGreaterThan(BigInt(0))
    expect(out).toBeLessThan(BigInt(920_000000))
  })

  it('output decreases with larger input (price impact)', () => {
    const reserveIn = BigInt(1000000_000000)
    const reserveOut = BigInt(1000000_000000)
    const small = getAmountOut(BigInt(100_000000), reserveIn, reserveOut)
    const large = getAmountOut(BigInt(100000_000000), reserveIn, reserveOut)
    // Rate: small/100 should be better than large/100000
    const smallRate = Number(small) / 100
    const largeRate = Number(large) / 100000
    expect(smallRate).toBeGreaterThan(largeRate)
  })
})

describe('getAmountIn', () => {
  it('returns 0 for zero output', () => {
    expect(getAmountIn(BigInt(0), BigInt(1000000), BigInt(1000000))).toBe(BigInt(0))
  })

  it('returns 0 when output exceeds reserve', () => {
    expect(getAmountIn(BigInt(2000000), BigInt(1000000), BigInt(1000000))).toBe(BigInt(0))
  })

  it('calculates inverse of getAmountOut approximately', () => {
    const reserveIn = BigInt(1000000_000000)
    const reserveOut = BigInt(1000000_000000)
    const amountIn = BigInt(1000_000000)
    const amountOut = getAmountOut(amountIn, reserveIn, reserveOut)
    const recoveredIn = getAmountIn(amountOut, reserveIn, reserveOut)
    // Should be close to original (within rounding)
    expect(Number(recoveredIn)).toBeCloseTo(Number(amountIn), -2)
  })
})

describe('calculatePriceImpact', () => {
  it('returns 0 for zero input', () => {
    expect(calculatePriceImpact(BigInt(0), BigInt(0), BigInt(1000000), BigInt(1000000))).toBe(0)
  })

  it('returns small impact for small trades', () => {
    const reserveIn = BigInt(1000000_000000)
    const reserveOut = BigInt(1000000_000000)
    const amountIn = BigInt(100_000000) // 100 tokens
    const amountOut = getAmountOut(amountIn, reserveIn, reserveOut)
    const impact = calculatePriceImpact(amountIn, amountOut, reserveIn, reserveOut)
    expect(impact).toBeLessThan(0.5) // Less than 0.5%
    expect(impact).toBeGreaterThan(0)
  })

  it('returns larger impact for large trades', () => {
    const reserveIn = BigInt(1000000_000000)
    const reserveOut = BigInt(1000000_000000)
    const amountIn = BigInt(100000_000000) // 100K tokens (10% of pool)
    const amountOut = getAmountOut(amountIn, reserveIn, reserveOut)
    const impact = calculatePriceImpact(amountIn, amountOut, reserveIn, reserveOut)
    expect(impact).toBeGreaterThan(5) // > 5%
  })
})

describe('calculateMinimumReceived', () => {
  it('applies slippage correctly at 0.5%', () => {
    const amountOut = BigInt(1000_000000) // 1000 tokens
    const minReceived = calculateMinimumReceived(amountOut, 50) // 50 bps = 0.5%
    expect(minReceived).toBe(BigInt(995_000000)) // 995 tokens
  })

  it('applies slippage correctly at 1%', () => {
    const amountOut = BigInt(1000_000000)
    const minReceived = calculateMinimumReceived(amountOut, 100) // 100 bps = 1%
    expect(minReceived).toBe(BigInt(990_000000))
  })

  it('returns full amount at 0% slippage', () => {
    const amountOut = BigInt(1000_000000)
    const minReceived = calculateMinimumReceived(amountOut, 0)
    expect(minReceived).toBe(amountOut)
  })
})
