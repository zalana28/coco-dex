/**
 * Shared react-query options for on-chain quote reads.
 *
 * Retry policy lives here rather than inline at each `useReadContract` so the
 * app has exactly one place where RPC pressure is tuned. It wires the backoff
 * in `quoteState.ts` — exponential with jitter, capped at 8s — which previously
 * existed with passing tests but no production call site.
 *
 * Two rules keep a 429 from becoming a storm:
 *
 * 1. Only retry *transient* failures. A reverted call or a bad argument will
 *    fail identically on retry, so retrying it just burns RPC budget.
 * 2. Keep the react-query retry count low, because the viem transport retries
 *    underneath it. The two layers multiply: N react-query attempts × M
 *    transport attempts. See `src/config/wagmi.ts`, where `retryCount` is held
 *    at 1 for the same reason.
 */
import { classifyQuoteError, getRetryConfig, isTransientRpcError } from './quoteState'
import { recordQuoteFailure } from './rpcOutageStore'

/**
 * How often quotes are refreshed.
 *
 * 12s rather than 30s, so a quote is refreshed roughly twice within its 30s TTL
 * instead of expiring at the moment it would be replaced. Only safe because the
 * rate-limiting work in this module landed first: polling is suspended during a
 * transaction, only transient failures are retried, retries no longer multiply
 * across two layers, and a single Synthra fee tier is polled instead of three.
 * Raising this frequency before those changes would have made the 429 storm
 * worse.
 */
export const QUOTE_REFETCH_INTERVAL_MS = 12_000
export const QUOTE_STALE_TIME_MS = 30_000

/** Retry only transient RPC failures, and only while `getRetryConfig` allows. */
export function shouldRetryQuote(failureCount: number, error: unknown): boolean {
  return getRetryConfig(failureCount).shouldRetry && isTransientRpcError(classifyQuoteError(error))
}

/**
 * Retry handler that also reports the failure to the circuit breaker.
 *
 * react-query calls this on every failed attempt, which makes it the one place
 * that sees every quote failure as it happens — the natural point to feed the
 * shared-outage detector without threading errors back through render.
 */
export function buildQuoteRetryHandler(provider: string) {
  return (failureCount: number, error: unknown): boolean => {
    recordQuoteFailure(provider, error)
    return shouldRetryQuote(failureCount, error)
  }
}

/** Exponential backoff with jitter, capped — shared with the outage detector. */
export function quoteRetryDelay(failureCount: number): number {
  return getRetryConfig(failureCount).delayMs
}

/**
 * Build the query options for a quote read.
 *
 * @param enabled  Whether this route should be read at all (pair supported, amount > 0).
 * @param paused   Whether polling is suspended — an in-flight transaction or an
 *                 open circuit breaker. While paused the query keeps its last
 *                 data but issues no requests, so the UI does not go blank.
 * @param provider Route name, so the breaker can tell one failing route apart
 *                 from the shared RPC failing for everyone.
 */
export function buildQuoteQueryOptions(enabled: boolean, paused: boolean, provider: string) {
  return {
    enabled: enabled && !paused,
    refetchInterval: paused ? (false as const) : QUOTE_REFETCH_INTERVAL_MS,
    // A backgrounded tab must not poll, and refocusing must not fire a
    // simultaneous refetch on every quote at once.
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    retry: buildQuoteRetryHandler(provider),
    retryDelay: quoteRetryDelay,
    staleTime: QUOTE_STALE_TIME_MS,
  }
}
