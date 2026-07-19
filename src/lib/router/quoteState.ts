/**
 * Quote state classification and error categorization for external route quotes.
 *
 * Root cause of intermittent failures: all external useReadContract calls share
 * the same Arc Testnet RPC transport. When the transport hiccups, multiple
 * providers fail simultaneously, each showing "Contract read failed". Previous
 * valid quote data is discarded, and the single `quoteTimestamp` (created once
 * via useState) never updates, so freshness checks are always stale.
 *
 * This module provides:
 * - Structured quote states (idle, loading, fresh, stale-cached, unavailable-*)
 * - Error classification (rpc-timeout, rpc-rate-limit, contract-revert, etc.)
 * - Transient failure detection (for retry decisions)
 * - Shared RPC outage detection (multiple providers failing within a window)
 */

/** Structured quote state. */
export type QuoteState =
  | 'idle'
  | 'loading'
  | 'fresh'
  | 'retrying'
  | 'stale-cached'
  | 'unavailable-no-liquidity'
  | 'unavailable-rpc'
  | 'unavailable-contract-revert'
  | 'unavailable-invalid-response'
  | 'disabled'

/** Sanitized error category. */
export type QuoteErrorCategory =
  | 'rpc-timeout'
  | 'rpc-rate-limit'
  | 'rpc-disconnected'
  | 'rpc-temporary'
  | 'wrong-chain'
  | 'contract-revert'
  | 'abi-mismatch'
  | 'invalid-path'
  | 'no-liquidity'
  | 'malformed-response'
  | 'unknown-sanitized'

/** True for transient RPC/transport failures that warrant retry. */
export function isTransientRpcError(category: QuoteErrorCategory): boolean {
  return (
    category === 'rpc-timeout' ||
    category === 'rpc-rate-limit' ||
    category === 'rpc-disconnected' ||
    category === 'rpc-temporary'
  )
}

/**
 * Classify a raw error from a useReadContract failure into a sanitized category.
 * Never exposes credentialed URLs, API keys, or raw Error.cause.
 */
export function classifyQuoteError(error: unknown): QuoteErrorCategory {
  if (!error) return 'unknown-sanitized'

  const message = typeof error === 'string'
    ? error
    : error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'shortMessage' in error
        ? String((error as { shortMessage?: unknown }).shortMessage ?? '')
        : String(error)

  const lower = message.toLowerCase()

  // RPC / transport errors
  if (lower.includes('timeout') || lower.includes('timed out')) return 'rpc-timeout'
  if (lower.includes('rate limit') || lower.includes('429') || lower.includes('too many requests')) return 'rpc-rate-limit'
  if (lower.includes('disconnect') || lower.includes('connection') || lower.includes('network') || lower.includes('fetch')) return 'rpc-disconnected'
  if (lower.includes('temporarily') || lower.includes('unavailable') || lower.includes('service unavailable') || lower.includes('503')) return 'rpc-temporary'

  // Chain errors
  if (lower.includes('chain') && lower.includes('mismatch')) return 'wrong-chain'

  // Contract revert
  if (lower.includes('execution reverted') || lower.includes('revert')) return 'contract-revert'

  // No liquidity (specific revert reason)
  if (lower.includes('insufficient liquidity') || lower.includes('no liquidity') || lower.includes('insufficient_output')) return 'no-liquidity'

  // ABI / path errors
  if (lower.includes('abi') || lower.includes('selector') || lower.includes('function not found')) return 'abi-mismatch'
  if (lower.includes('path') || lower.includes('invalid path')) return 'invalid-path'

  // Malformed response
  if (lower.includes('decode') || lower.includes('malformed') || lower.includes('invalid result')) return 'malformed-response'

  return 'unknown-sanitized'
}

/**
 * Determine the quote state given current data, error, loading, and previous data.
 *
 * When a refresh fails but previous data exists, the state is 'stale-cached'
 * (not 'unavailable-rpc'), so the UI can show "Last quote" instead of a red error.
 */
export function resolveQuoteState(input: {
  hasData: boolean
  hasError: boolean
  isLoading: boolean
  hasPreviousData: boolean
  errorCategory?: QuoteErrorCategory
}): QuoteState {
  if (input.hasError && input.hasPreviousData && !input.isLoading) {
    const category = input.errorCategory ?? 'unknown-sanitized'
    if (isTransientRpcError(category)) return 'stale-cached'
    // Deterministic errors with previous data: still stale-cached for display,
    // but the error category determines whether retry is attempted.
    if (category === 'contract-revert' || category === 'no-liquidity') return 'stale-cached'
    return 'stale-cached'
  }

  if (input.hasError && !input.hasPreviousData) {
    const category = input.errorCategory ?? 'unknown-sanitized'
    if (category === 'no-liquidity') return 'unavailable-no-liquidity'
    if (category === 'contract-revert') return 'unavailable-contract-revert'
    if (category === 'malformed-response') return 'unavailable-invalid-response'
    if (isTransientRpcError(category)) return 'unavailable-rpc'
    return 'unavailable-rpc'
  }

  if (input.isLoading && !input.hasData) return 'loading'
  if (input.isLoading && input.hasData) return 'retrying'
  if (input.hasData) return 'fresh'

  return 'idle'
}

/**
 * Sanitized human-readable label for a quote state.
 */
export function quoteStateLabel(state: QuoteState, quoteAgeMs?: number): string {
  switch (state) {
    case 'idle': return 'Waiting for input'
    case 'loading': return 'Loading quote'
    case 'fresh': return 'Fresh quote'
    case 'retrying': return 'Retrying quote'
    case 'stale-cached': {
      if (quoteAgeMs !== undefined) {
        const seconds = Math.floor(quoteAgeMs / 1000)
        if (seconds < 60) return `Last quote · ${seconds}s ago`
        const minutes = Math.floor(seconds / 60)
        return `Last quote · ${minutes}m ago`
      }
      return 'Last quote · stale'
    }
    case 'unavailable-no-liquidity': return 'No available liquidity'
    case 'unavailable-rpc': return 'RPC temporarily unavailable'
    case 'unavailable-contract-revert': return 'Contract read failed'
    case 'unavailable-invalid-response': return 'Invalid quote response'
    case 'disabled': return 'Disabled'
  }
}

/**
 * UI severity for a quote state.
 * - 'neutral' for transient/loading states (amber)
 * - 'danger' for deterministic safety failures (red)
 * - 'normal' for fresh quotes
 */
export function quoteStateSeverity(state: QuoteState): 'normal' | 'neutral' | 'danger' {
  switch (state) {
    case 'fresh': return 'normal'
    case 'idle':
    case 'loading':
    case 'retrying':
    case 'stale-cached':
    case 'unavailable-rpc':
    case 'unavailable-no-liquidity':
      return 'neutral'
    case 'unavailable-contract-revert':
    case 'unavailable-invalid-response':
    case 'disabled':
      return 'danger'
  }
}

/**
 * Shared RPC outage detection.
 *
 * Returns true when multiple providers fail with transient RPC errors
 * within the given time window, indicating a shared transport issue
 * rather than individual contract failures.
 */
export function detectSharedRpcOutage(
  failures: Array<{ provider: string; timestamp: number; category: QuoteErrorCategory }>,
  windowMs: number = 10_000,
  nowMs: number = Date.now(),
): boolean {
  const recentTransientFailures = failures.filter(
    (f) => isTransientRpcError(f.category) && nowMs - f.timestamp < windowMs,
  )
  // At least 2 providers failing with transient RPC errors within the window
  const uniqueProviders = new Set(recentTransientFailures.map((f) => f.provider))
  return uniqueProviders.size >= 2
}

/**
 * Retry config for transient RPC failures.
 * Bounded exponential backoff with jitter. Max 3 attempts.
 */
export function getRetryConfig(attempt: number): { delayMs: number; shouldRetry: boolean } {
  const maxAttempts = 3
  if (attempt >= maxAttempts) return { delayMs: 0, shouldRetry: false }
  const baseDelay = 1_000 // 1s
  const maxJitter = 500
  const exponential = baseDelay * Math.pow(2, attempt)
  const jitter = Math.random() * maxJitter
  return { delayMs: Math.min(exponential + jitter, 8_000), shouldRetry: true }
}
