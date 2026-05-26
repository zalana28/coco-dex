import { describe, it, expect } from 'vitest'
import { getAmountOut, getAmountIn, calculatePriceImpact, calculateMinimumReceived } from './price'
import { formatTokenAmount, parseTokenAmount } from './format'
import { USDC, EURC } from '@/config/tokens'
import { arcTestnet } from '@/config/chains'

/**
 * These tests explicitly prove that all DEX math uses 6-decimal ERC-20 values
 * and is never confused with the 18-decimal native gas accounting on Arc.
 */
describe('6-decimal ERC-20 math (USDC/EURC)', () => {
  describe('token config', () => {
    it('USDC is configured as 6 decimals', () => {
      expect(USDC.decimals).toBe(6)
    })

    it('EURC is configured as 6 decimals', () => {
      expect(EURC.decimals).toBe(6)
    })

    it('Arc native currency is 18 decimals (different from ERC-20)', () => {
      expect(arcTestnet.nativeCurrency.decimals).toBe(18)
    })

    it('native and ERC-20 decimals are NOT equal', () => {
      expect(arcTestnet.nativeCurrency.decimals).not.toBe(USDC.decimals)
    })
  })

  describe('parseTokenAmount uses 6 decimals', () => {
    it('1 USDC = 1_000_000 raw units (not 1e18)', () => {
      const raw = parseTokenAmount('1', USDC.decimals)
      expect(raw).toBe(BigInt(1_000_000))
      // Ensure it's NOT 18-decimal
      expect(raw).not.toBe(BigInt('1000000000000000000'))
    })

    it('1000 USDC = 1_000_000_000 raw units', () => {
      const raw = parseTokenAmount('1000', USDC.decimals)
      expect(raw).toBe(BigInt(1_000_000_000))
    })

    it('0.000001 USDC = 1 raw unit (smallest ERC-20 amount)', () => {
      const raw = parseTokenAmount('0.000001', USDC.decimals)
      expect(raw).toBe(BigInt(1))
    })

    it('1 EURC = 1_000_000 raw units', () => {
      const raw = parseTokenAmount('1', EURC.decimals)
      expect(raw).toBe(BigInt(1_000_000))
    })
  })

  describe('formatTokenAmount uses 6 decimals', () => {
    it('1_000_000 raw units = "1" USDC', () => {
      expect(formatTokenAmount(BigInt(1_000_000), USDC.decimals)).toBe('1')
    })

    it('1_500_000 raw units = "1.5" USDC', () => {
      expect(formatTokenAmount(BigInt(1_500_000), USDC.decimals)).toBe('1.5')
    })

    it('1 raw unit = "0.000001" (smallest displayable amount)', () => {
      expect(formatTokenAmount(BigInt(1), USDC.decimals)).toBe('0.000001')
    })
  })

  describe('AMM math operates on 6-decimal raw amounts', () => {
    // Simulating a pool with 1M USDC / 920K EURC (both at 6 decimals)
    const RESERVE_USDC = BigInt(1_000_000) * BigInt(1_000_000) // 1M USDC in raw
    const RESERVE_EURC = BigInt(920_000) * BigInt(1_000_000)   // 920K EURC in raw

    it('swap 100 USDC returns amount in 6-decimal EURC range', () => {
      const amountIn = BigInt(100) * BigInt(1_000_000) // 100 USDC
      const amountOut = getAmountOut(amountIn, RESERVE_USDC, RESERVE_EURC)

      // Result should be roughly 92 EURC (in 6-decimal raw)
      const asEurc = Number(amountOut) / 1_000_000
      expect(asEurc).toBeGreaterThan(91)
      expect(asEurc).toBeLessThan(92)

      // Verify it's NOT in 18-decimal range
      expect(amountOut).toBeLessThan(BigInt('100000000000000000'))
    })

    it('getAmountIn for 92 EURC output gives ~100 USDC input', () => {
      const desiredOut = BigInt(92) * BigInt(1_000_000) // 92 EURC
      const requiredIn = getAmountIn(desiredOut, RESERVE_USDC, RESERVE_EURC)

      const asUsdc = Number(requiredIn) / 1_000_000
      expect(asUsdc).toBeGreaterThan(99)
      expect(asUsdc).toBeLessThan(101)
    })

    it('price impact is calculated correctly at 6 decimal scale', () => {
      const amountIn = BigInt(10_000) * BigInt(1_000_000) // 10K USDC (1% of pool)
      const amountOut = getAmountOut(amountIn, RESERVE_USDC, RESERVE_EURC)
      const impact = calculatePriceImpact(amountIn, amountOut, RESERVE_USDC, RESERVE_EURC)

      // 1% of pool should give roughly 1% price impact
      expect(impact).toBeGreaterThan(0.5)
      expect(impact).toBeLessThan(2)
    })

    it('minimum received applies slippage to 6-decimal amount', () => {
      const amountOut = BigInt(920) * BigInt(1_000_000) // 920 EURC
      const minReceived = calculateMinimumReceived(amountOut, 50) // 0.5% slippage

      // 920 * 0.995 = 915.4 EURC
      const asEurc = Number(minReceived) / 1_000_000
      expect(asEurc).toBeCloseTo(915.4, 0)
    })
  })
})
