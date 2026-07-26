import { describe, expect, it } from 'vitest'
import { buildQuoteQueryOptions, quoteRetryDelay, shouldRetryQuote, QUOTE_REFETCH_INTERVAL_MS } from './quoteQueryOptions'

const rateLimited = new Error('HTTP request failed. Status code: 429')
const reverted = new Error('execution reverted: INSUFFICIENT_OUTPUT_AMOUNT')

describe('shouldRetryQuote', () => {
  it('retries a transient rate-limit failure', () => {
    expect(shouldRetryQuote(0, rateLimited)).toBe(true)
  })

  it('does not retry a contract revert — it will fail identically and only adds load', () => {
    expect(shouldRetryQuote(0, reverted)).toBe(false)
  })

  it('stops retrying once the attempt budget is exhausted', () => {
    // getRetryConfig caps at 3 attempts; beyond that nothing should retry,
    // transient or not.
    expect(shouldRetryQuote(99, rateLimited)).toBe(false)
  })
})

describe('quoteRetryDelay', () => {
  it('backs off as attempts increase', () => {
    expect(quoteRetryDelay(1)).toBeGreaterThan(quoteRetryDelay(0))
  })

  it('stays capped rather than growing without bound', () => {
    expect(quoteRetryDelay(20)).toBeLessThanOrEqual(8_000)
  })
})

describe('buildQuoteQueryOptions', () => {
  it('polls when enabled and not paused', () => {
    const options = buildQuoteQueryOptions(true, false)
    expect(options.enabled).toBe(true)
    expect(options.refetchInterval).toBe(QUOTE_REFETCH_INTERVAL_MS)
  })

  it('stops polling while paused, without disabling the route permanently', () => {
    const options = buildQuoteQueryOptions(true, true)
    expect(options.enabled).toBe(false)
    expect(options.refetchInterval).toBe(false)
  })

  it('stays disabled when the route itself is unsupported', () => {
    expect(buildQuoteQueryOptions(false, false).enabled).toBe(false)
  })

  it('never refetches on window focus or in a background tab', () => {
    // Refocusing previously fired a simultaneous refetch on every quote at once.
    const options = buildQuoteQueryOptions(true, false)
    expect(options.refetchOnWindowFocus).toBe(false)
    expect(options.refetchIntervalInBackground).toBe(false)
  })
})
