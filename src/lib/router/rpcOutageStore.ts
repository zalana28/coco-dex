/**
 * Tracks whether the shared Arc Testnet RPC is failing, independently of React.
 *
 * This lives outside the component tree on purpose. Quote failures happen while
 * react-query is executing, not while React is rendering, and the breaker has
 * to gate the very reads that feed it. Holding the state in a component would
 * mean either writing state from an effect or reading a ref during render —
 * both are the wrong shape for "something happened outside React". An external
 * store subscribed to via `useSyncExternalStore` says what is actually true.
 *
 * Failures are reported from the shared retry handler in `quoteQueryOptions.ts`,
 * which react-query invokes on every failed attempt.
 */
import { classifyQuoteError, detectSharedRpcOutage, isTransientRpcError } from './quoteState'

/** How long polling stays suspended once the breaker opens. */
export const RPC_CIRCUIT_PAUSE_MS = 45_000

/** Window `detectSharedRpcOutage` considers when deciding the RPC is at fault. */
const OUTAGE_WINDOW_MS = 10_000

type Failure = { provider: string; timestamp: number; category: ReturnType<typeof classifyQuoteError> }

let failures: Failure[] = []
let openedAt: number | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

/** Drop the pause once it has elapsed, so a later outage can open a new one. */
function expireIfElapsed(nowMs: number) {
  if (openedAt !== null && nowMs - openedAt >= RPC_CIRCUIT_PAUSE_MS) openedAt = null
}

/**
 * Report a failed quote read.
 *
 * One route failing is a route problem; several distinct routes failing at once
 * is the shared RPC. `detectSharedRpcOutage` encodes that "two or more distinct
 * providers within the window" rule, so a single flaky router never trips the
 * breaker.
 */
export function recordQuoteFailure(provider: string, error: unknown, nowMs: number = Date.now()): void {
  const category = classifyQuoteError(error)
  if (!isTransientRpcError(category)) return

  expireIfElapsed(nowMs)
  failures = [...failures, { provider, timestamp: nowMs, category }].filter(
    (f) => nowMs - f.timestamp <= OUTAGE_WINDOW_MS
  )

  if (openedAt === null && detectSharedRpcOutage(failures, OUTAGE_WINDOW_MS, nowMs)) {
    openedAt = nowMs
    emit()
  }
}

/** Close the breaker immediately — backs the "Retry now" button. */
export function dismissRpcOutage(): void {
  if (openedAt === null && failures.length === 0) return
  openedAt = null
  failures = []
  emit()
}

/**
 * When the current pause began, or null when none is running.
 *
 * Deliberately side-effect free: this backs `useSyncExternalStore`'s snapshot,
 * which must be pure and stable. Whether the pause is *still* open is the
 * caller's arithmetic against its own clock; expiry of the stored value happens
 * on the next recorded failure.
 */
export function getRpcOutageOpenedAt(): number | null {
  return openedAt
}

export function subscribeToRpcOutage(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Test seam — resets module state between cases. */
export function resetRpcOutageStore(): void {
  failures = []
  openedAt = null
}
