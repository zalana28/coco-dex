import { describe, expect, it } from 'vitest'
import { USDC, EURC } from '@/config/tokens'
import { arcTestnet } from '@/config/chains'
import { buildXyloNetRouteQuote } from './xylonetAdapter'
import { buildUnitFlowRouteQuote } from './unitflowAdapter'
import { buildSynthraRouteQuote } from './synthraAdapter'
import { getCocoRouteQuote } from './cocoAdapter'
import { isQuoteStale } from './selectBestRoute'
import { DEFAULT_ROUTE_TTL_MS } from './routeMetadata'

/**
 * Regression cover for the staleness bug.
 *
 * Every adapter used to stamp `quoteTimestamp: Date.now()` at construction
 * time. Because the adapters are called from a `useMemo` whose deps include a
 * clock that ticks every 5s, the quote object was rebuilt — and re-stamped —
 * while `amountOut` could be up to 30s old. The age was therefore always ~0ms
 * and `isQuoteStale` could never return true, which made the swap guard and the
 * "Fresh quote" badge meaningless.
 *
 * The fix is that `quotedAt` is a required parameter carrying react-query's
 * `dataUpdatedAt` — when the chain read actually completed. These tests pin
 * that: a quote built *now* from a read that happened *then* must be stale.
 */

const NOW = 1_700_000_000_000
const STALE_READ_AT = NOW - DEFAULT_ROUTE_TTL_MS - 1_000
const FRESH_READ_AT = NOW - 1_000

const AMOUNT_IN = BigInt(1_000_000) // 1 USDC, 6 decimals
const AMOUNT_OUT = BigInt(920_000)
const RESERVE = BigInt(1_000_000_000)

describe('quote freshness is driven by the underlying read, not construction time', () => {
  it('XyloNet: a quote built now from an old read is stale', () => {
    const stale = buildXyloNetRouteQuote({
      tokenIn: USDC, tokenOut: EURC, amountIn: AMOUNT_IN, amountOut: AMOUNT_OUT,
      slippageBps: 50, chainId: arcTestnet.id, quotedAt: STALE_READ_AT,
    })
    const fresh = buildXyloNetRouteQuote({
      tokenIn: USDC, tokenOut: EURC, amountIn: AMOUNT_IN, amountOut: AMOUNT_OUT,
      slippageBps: 50, chainId: arcTestnet.id, quotedAt: FRESH_READ_AT,
    })

    expect(stale.quoteTimestamp).toBe(STALE_READ_AT)
    expect(isQuoteStale(stale, NOW)).toBe(true)
    expect(isQuoteStale(fresh, NOW)).toBe(false)
  })

  it('UnitFlow: a quote built now from an old read is stale', () => {
    const stale = buildUnitFlowRouteQuote({
      tokenIn: USDC, tokenOut: EURC, amountIn: AMOUNT_IN,
      amountsOut: [AMOUNT_IN, AMOUNT_OUT], slippageBps: 50, quotedAt: STALE_READ_AT,
    })

    expect(stale.quoteTimestamp).toBe(STALE_READ_AT)
    expect(isQuoteStale(stale, NOW)).toBe(true)
  })

  it('Synthra: a quote built now from an old read is stale', () => {
    const stale = buildSynthraRouteQuote({
      tokenIn: USDC, tokenOut: EURC, amountIn: AMOUNT_IN,
      feeQuotes: [{ fee: 500, amountOut: AMOUNT_OUT }], slippageBps: 50,
      chainId: arcTestnet.id, quotedAt: STALE_READ_AT,
    })

    expect(stale.quoteTimestamp).toBe(STALE_READ_AT)
    expect(isQuoteStale(stale, NOW)).toBe(true)
  })

  it('Coco: freshness comes from the reserves read', () => {
    const stale = getCocoRouteQuote({
      tokenIn: USDC, tokenOut: EURC, amountIn: AMOUNT_IN,
      reserveUsdc: RESERVE, reserveEurc: RESERVE, slippageBps: 50, quotedAt: STALE_READ_AT,
    })

    expect(stale).toBeDefined()
    expect(stale?.quoteTimestamp).toBe(STALE_READ_AT)
    expect(isQuoteStale(stale!, NOW)).toBe(true)
  })

  it('rebuilding the same quote object does not refresh it', () => {
    // The exact regression: the memo re-runs on every clock tick, so the object
    // is rebuilt constantly. Rebuilding must not reset the age.
    const first = buildXyloNetRouteQuote({
      tokenIn: USDC, tokenOut: EURC, amountIn: AMOUNT_IN, amountOut: AMOUNT_OUT,
      slippageBps: 50, chainId: arcTestnet.id, quotedAt: STALE_READ_AT,
    })
    const rebuiltLater = buildXyloNetRouteQuote({
      tokenIn: USDC, tokenOut: EURC, amountIn: AMOUNT_IN, amountOut: AMOUNT_OUT,
      slippageBps: 50, chainId: arcTestnet.id, quotedAt: STALE_READ_AT,
    })

    expect(rebuiltLater.quoteTimestamp).toBe(first.quoteTimestamp)
    expect(isQuoteStale(rebuiltLater, NOW + 60_000)).toBe(true)
  })
})
