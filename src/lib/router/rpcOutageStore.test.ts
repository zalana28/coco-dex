import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  dismissRpcOutage,
  getRpcOutageOpenedAt,
  recordQuoteFailure,
  resetRpcOutageStore,
  RPC_CIRCUIT_PAUSE_MS,
  subscribeToRpcOutage,
} from './rpcOutageStore'

const rateLimited = () => new Error('HTTP request failed. Status code: 429')
const timedOut = () => new Error('The request timed out.')
const reverted = () => new Error('execution reverted: INSUFFICIENT_OUTPUT_AMOUNT')

const T0 = 1_000_000

beforeEach(() => {
  resetRpcOutageStore()
  vi.restoreAllMocks()
})

describe('recordQuoteFailure', () => {
  it('stays closed when only one route is failing — that is a route problem', () => {
    recordQuoteFailure('xylonet', rateLimited(), T0)
    recordQuoteFailure('xylonet', rateLimited(), T0 + 100)

    expect(getRpcOutageOpenedAt()).toBeNull()
  })

  it('opens when two distinct routes fail transiently within the window', () => {
    recordQuoteFailure('xylonet', rateLimited(), T0)
    recordQuoteFailure('unitflow', timedOut(), T0 + 500)

    expect(getRpcOutageOpenedAt()).toBe(T0 + 500)
  })

  it('ignores non-transient failures — reverts on every route are not an outage', () => {
    recordQuoteFailure('xylonet', reverted(), T0)
    recordQuoteFailure('unitflow', reverted(), T0 + 100)
    recordQuoteFailure('synthra', reverted(), T0 + 200)

    expect(getRpcOutageOpenedAt()).toBeNull()
  })

  it('does not open on failures spread beyond the detection window', () => {
    recordQuoteFailure('xylonet', rateLimited(), T0)
    // 30s later — the first failure has aged out of the 10s window.
    recordQuoteFailure('unitflow', timedOut(), T0 + 30_000)

    expect(getRpcOutageOpenedAt()).toBeNull()
  })

  it('keeps the original opened-at while the pause is still running', () => {
    recordQuoteFailure('xylonet', rateLimited(), T0)
    recordQuoteFailure('unitflow', timedOut(), T0 + 500)
    recordQuoteFailure('synthra', timedOut(), T0 + 1_000)

    expect(getRpcOutageOpenedAt()).toBe(T0 + 500)
  })
})

describe('expiry', () => {
  it('is a pure read — the snapshot never changes just because time passed', () => {
    // useSyncExternalStore requires a side-effect-free, stable snapshot. Whether
    // the pause is still running is the hook's arithmetic, not the store's.
    recordQuoteFailure('xylonet', rateLimited(), T0)
    recordQuoteFailure('unitflow', timedOut(), T0)

    expect(getRpcOutageOpenedAt()).toBe(T0)
    expect(getRpcOutageOpenedAt()).toBe(T0)
  })

  it('can open a fresh pause once the previous one has elapsed', () => {
    recordQuoteFailure('xylonet', rateLimited(), T0)
    recordQuoteFailure('unitflow', timedOut(), T0)
    expect(getRpcOutageOpenedAt()).toBe(T0)

    const later = T0 + RPC_CIRCUIT_PAUSE_MS + 10_000
    recordQuoteFailure('xylonet', rateLimited(), later)
    recordQuoteFailure('synthra', timedOut(), later)

    expect(getRpcOutageOpenedAt()).toBe(later)
  })

  it('does not restart the pause on failures arriving while it runs', () => {
    recordQuoteFailure('xylonet', rateLimited(), T0)
    recordQuoteFailure('unitflow', timedOut(), T0)

    recordQuoteFailure('synthra', timedOut(), T0 + RPC_CIRCUIT_PAUSE_MS - 1)

    expect(getRpcOutageOpenedAt()).toBe(T0)
  })
})

describe('dismissRpcOutage', () => {
  it('closes immediately', () => {
    recordQuoteFailure('xylonet', rateLimited(), T0)
    recordQuoteFailure('unitflow', timedOut(), T0)
    expect(getRpcOutageOpenedAt()).not.toBeNull()

    dismissRpcOutage()
    expect(getRpcOutageOpenedAt()).toBeNull()
  })

  it('clears the failure log, so the same failures do not re-open it', () => {
    recordQuoteFailure('xylonet', rateLimited(), T0)
    recordQuoteFailure('unitflow', timedOut(), T0)
    dismissRpcOutage()

    // A single fresh failure must not be enough on its own.
    recordQuoteFailure('xylonet', rateLimited(), T0 + 100)
    expect(getRpcOutageOpenedAt()).toBeNull()
  })
})

describe('subscribeToRpcOutage', () => {
  it('notifies subscribers when the breaker opens and when it is dismissed', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToRpcOutage(listener)

    recordQuoteFailure('xylonet', rateLimited(), T0)
    expect(listener).not.toHaveBeenCalled() // one route only

    recordQuoteFailure('unitflow', timedOut(), T0)
    expect(listener).toHaveBeenCalledTimes(1)

    dismissRpcOutage()
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    recordQuoteFailure('xylonet', rateLimited(), T0 + 1)
    recordQuoteFailure('synthra', timedOut(), T0 + 2)
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
