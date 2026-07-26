import { useSyncExternalStore } from 'react'
import {
  dismissRpcOutage,
  getRpcOutageOpenedAt,
  RPC_CIRCUIT_PAUSE_MS,
  subscribeToRpcOutage,
} from '@/lib/router/rpcOutageStore'

export { RPC_CIRCUIT_PAUSE_MS }

export type RpcCircuitBreakerState = {
  /** True while polling should stay suspended. */
  isOpen: boolean
  /** Whole seconds until polling resumes on its own. 0 when closed. */
  secondsRemaining: number
  /** Close immediately and allow the next poll — backs the "Retry now" button. */
  retryNow: () => void
}

/**
 * React view over `rpcOutageStore`.
 *
 * The store holds only *when* the pause began; whether it is still open is
 * arithmetic against the caller's clock. That keeps the countdown live without
 * a second timer, and means the breaker closes on its own with no state write.
 *
 * @param nowMs Ticking clock, so the countdown re-renders as it counts down.
 */
export function useRpcCircuitBreaker(nowMs: number): RpcCircuitBreakerState {
  const openedAt = useSyncExternalStore(
    subscribeToRpcOutage,
    getRpcOutageOpenedAt,
    getRpcOutageOpenedAt
  )

  const elapsed = openedAt === null ? 0 : nowMs - openedAt
  const isOpen = openedAt !== null && elapsed < RPC_CIRCUIT_PAUSE_MS

  return {
    isOpen,
    secondsRemaining: isOpen ? Math.max(0, Math.ceil((RPC_CIRCUIT_PAUSE_MS - elapsed) / 1000)) : 0,
    retryNow: dismissRpcOutage,
  }
}
