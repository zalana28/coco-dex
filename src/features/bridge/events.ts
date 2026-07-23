import type { BridgeKit } from '@circle-fin/bridge-kit'
import { canonicalStepName, type LifecycleStepName } from './attempt'

export interface BridgeEventInfo {
  attemptId: string
  traceId?: string
  action: string
  stepName: LifecycleStepName | undefined
  txHash?: string
  explorerUrl?: string
  errorCategory?: string
  message?: string
  state?: string
}

export interface BridgeEventHandlers {
  onEvent(info: BridgeEventInfo): void
}

/**
 * Register lifecycle event handlers on a BridgeKit BEFORE invoking bridge().
 *
 * Uses the public `kit.on(action, handler)` API. We listen to the wildcard '*'
 * to capture every action, then correlate each event to the correct attempt by
 * the invocation `traceId` (set via `invocationMeta` in buildBridgeParams).
 *
 * An event whose traceId does not match the active attempt is ignored, so a late
 * event from an old attempt can never mutate a newer attempt.
 *
 * Returns an unsubscribe function for cleanup.
 */
export function subscribeBridgeEvents(
  kit: BridgeKit,
  attemptId: string,
  traceId: string | undefined,
  handlers: BridgeEventHandlers,
): () => void {
  const handle = (payload: unknown) => {
    if (!payload || typeof payload !== 'object') return
    const record = payload as Record<string, unknown>
    const method = typeof record.method === 'string' ? record.method : undefined
    const values = record.values && typeof record.values === 'object' ? (record.values as Record<string, unknown>) : undefined
    const eventTraceId = typeof record.traceId === 'string' ? record.traceId : (values && typeof values.traceId === 'string' ? values.traceId : undefined)
    // Correlate strictly: only events for this attempt (matching traceId when one exists).
    if (traceId && eventTraceId && eventTraceId !== traceId) return
    const action = method ?? (typeof record.action === 'string' ? record.action : '')
    const stepName = canonicalStepName(action)
    const txHash = values && typeof values.txHash === 'string' ? values.txHash : undefined
    const explorerUrl = values && typeof values.explorerUrl === 'string' ? values.explorerUrl : undefined
    const errorCategory = values && typeof values.errorCategory === 'string' ? values.errorCategory : undefined
    const message = values && typeof values.message === 'string' ? values.message : (typeof record.message === 'string' ? record.message : undefined)
    const state = values && typeof values.state === 'string' ? values.state : undefined
    handlers.onEvent({ attemptId, traceId, action, stepName, txHash, explorerUrl, errorCategory, message, state })
  }

  kit.on('*', handle)
  return () => {
    try { kit.off('*', handle) } catch { /* ignore unsubscribe errors */ }
  }
}
