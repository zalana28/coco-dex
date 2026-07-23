import { describe, expect, it, vi } from 'vitest'
import { buildSynthraRouteQuote, isSynthraPairSupported, getSynthraV3QuoteRequest, SYNTHRA_V3_QUOTER_ABI } from './synthraAdapter'
import { USDC, EURC } from '@/config/tokens'
import { classifyQuoteError } from './quoteState'

function makeToken(addr: string, decimals = 6) {
  return {
    address: addr as `0x${string}`,
    symbol: addr === USDC.address ? 'USDC' : 'EURC',
    decimals,
    name: 'Test',
  } as never
}

const usdc = makeToken(USDC.address)
const eurc = makeToken(EURC.address)

describe('Synthra adapter', () => {
  describe('pair support', () => {
    it('supports USDC→EURC', () => {
      expect(isSynthraPairSupported(usdc, eurc)).toBe(true)
    })

    it('supports EURC→USDC', () => {
      expect(isSynthraPairSupported(eurc, usdc)).toBe(true)
    })

    it('rejects other pairs', () => {
      const other = makeToken('0x1111111111111111111111111111111111111111')
      expect(isSynthraPairSupported(usdc, other)).toBe(false)
    })
  })

  describe('quote request', () => {
    it('returns undefined for zero amount', () => {
      expect(getSynthraV3QuoteRequest(usdc, eurc, 0n)).toBeUndefined()
    })

    it('returns tokenIn, tokenOut, amountIn without recipient', () => {
      const req = getSynthraV3QuoteRequest(usdc, eurc, 1_000_000n)
      expect(req?.tokenIn).toBe(USDC.address)
      expect(req?.tokenOut).toBe(EURC.address)
      expect(req?.amountIn).toBe(1_000_000n)
    })
  })

  describe('ABI is flat 5-param shape (verified on-chain selector 0xc6a5026a)', () => {
    it('declares 5 flat input params without struct or recipient', () => {
      const fn = SYNTHRA_V3_QUOTER_ABI[0]
      const names = fn.inputs.map((i) => i.name)
      expect(names).toContain('tokenIn')
      expect(names).toContain('tokenOut')
      expect(names).toContain('amountIn')
      expect(names).toContain('fee')
      expect(names).toContain('sqrtPriceLimitX96')
      expect(names).not.toContain('recipient')
      expect(fn.inputs).toHaveLength(5)
    })

    it('declares 4 output fields', () => {
      const fn = SYNTHRA_V3_QUOTER_ABI[0]
      expect(fn.outputs).toHaveLength(4)
    })
  })

  describe('error classification', () => {
    it('classifies transient RPC as temporarily unavailable', () => {
      const quote = buildSynthraRouteQuote({
        tokenIn: usdc, tokenOut: eurc, amountIn: 1_000_000n,
        feeQuotes: [], slippageBps: 50,
        error: new Error('RPC timeout'),
      })
      expect(quote.availabilityStatus).toBe('unavailable')
      expect(quote.unavailableReason).toBe('Temporarily unavailable — retrying')
    })

    it('classifies contract revert as no active pool', () => {
      const quote = buildSynthraRouteQuote({
        tokenIn: usdc, tokenOut: eurc, amountIn: 1_000_000n,
        feeQuotes: [], slippageBps: 50,
        error: new Error('execution reverted: pool does not exist'),
      })
      expect(quote.availabilityStatus).toBe('unavailable')
      expect(quote.unavailableReason).toBe('No active USDC/EURC pool')
    })

    it('classifies no-liquidity as no active pool', () => {
      const quote = buildSynthraRouteQuote({
        tokenIn: usdc, tokenOut: eurc, amountIn: 1_000_000n,
        feeQuotes: [], slippageBps: 50,
        error: new Error('insufficient liquidity'),
      })
      expect(quote.unavailableReason).toBe('No active USDC/EURC pool')
    })

    it('does not use generic Contract read failed for classified errors', () => {
      const quote = buildSynthraRouteQuote({
        tokenIn: usdc, tokenOut: eurc, amountIn: 1_000_000n,
        feeQuotes: [], slippageBps: 50,
        error: new Error('execution reverted'),
      })
      expect(quote.unavailableReason).not.toBe('Contract read failed')
    })

    it('falls back to Contract read failed for unknown errors', () => {
      const quote = buildSynthraRouteQuote({
        tokenIn: usdc, tokenOut: eurc, amountIn: 1_000_000n,
        feeQuotes: [], slippageBps: 50,
        error: new Error('some weird error'),
      })
      expect(quote.unavailableReason).toBe('Contract read failed')
    })
  })

  describe('valid quote', () => {
    it('builds executable quote with positive minReceived', () => {
      vi.stubEnv('VITE_ENABLE_SYNTHRA_EXECUTION', 'true')
      const quote = buildSynthraRouteQuote({
        tokenIn: usdc, tokenOut: eurc, amountIn: 1_000_000n,
        feeQuotes: [{ fee: 500, amountOut: 980_000n }],
        slippageBps: 50,
        chainId: 5_042_002,
      })
      expect(quote.availabilityStatus).toBe('available')
      expect(quote.isExecutable).toBe(true)
      expect(quote.minAmountOut).toBeGreaterThan(0n)
      expect(quote.minAmountOut).toBeLessThanOrEqual(980_000n)
    })

    it('selects best fee tier by output', () => {
      const quote = buildSynthraRouteQuote({
        tokenIn: usdc, tokenOut: eurc, amountIn: 1_000_000n,
        feeQuotes: [
          { fee: 500, amountOut: 980_000n },
          { fee: 3000, amountOut: 985_000n },
          { fee: 10000, amountOut: 900_000n },
        ],
        slippageBps: 50,
      })
      expect(quote.id).toBe('synthra-v3-3000')
    })
  })
})

describe('classifyQuoteError sanity', () => {
  it('detects contract revert', () => {
    expect(classifyQuoteError(new Error('execution reverted'))).toBe('contract-revert')
  })
  it('detects no liquidity', () => {
    expect(classifyQuoteError(new Error('insufficient liquidity'))).toBe('no-liquidity')
  })
})
