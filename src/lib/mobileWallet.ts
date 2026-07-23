/**
 * Mobile wallet reliability helpers.
 *
 * Root causes addressed:
 * 1. "Requested resource not available / Tab tidak aktif" — viem/wagmi throws
 *    when the injected provider becomes unavailable during tab backgrounding.
 * 2. HTTP 429 from Arc Testnet RPC during burst reads (quote polling + simulation).
 * 3. Double-tap producing duplicate wallet requests.
 */

// ── Tab visibility guard ───────────────────────────────────────────────────

/**
 * Returns true if the document is visible and focused — safe to make wallet
 * provider requests. On mobile, wallet apps often background the DApp tab
 * while the wallet popup is open, causing provider requests to fail with
 * "Requested resource not available" / "Tab tidak aktif".
 */
export function isDocumentActive(): boolean {
  if (typeof document === 'undefined') return true
  return document.visibilityState === 'visible' && document.hasFocus()
}

/**
 * Wait until the document becomes visible and focused.
 * Resolves immediately if already active.
 * Returns a promise that resolves to true if active within timeout, false otherwise.
 */
export function waitForDocumentActive(timeoutMs = 10_000): Promise<boolean> {
  if (isDocumentActive()) return Promise.resolve(true)

  return new Promise((resolve) => {
    let resolved = false
    const cleanup = () => {
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
      if (timer) window.clearTimeout(timer)
    }
    const check = () => {
      if (isDocumentActive() && !resolved) {
        resolved = true
        cleanup()
        resolve(true)
      }
    }
    const timer = window.setTimeout(() => {
      if (!resolved) {
        resolved = true
        cleanup()
        resolve(false)
      }
    }, timeoutMs)

    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
  })
}

// ── Submit lock ────────────────────────────────────────────────────────────

/**
 * Synchronous mutex for preventing duplicate wallet requests from rapid taps
 * or double-clicks. Uses a ref-like singleton so the lock is process-global.
 *
 * The lock persists through tab backgrounding — it is only released on
 * definitive completion, failure, or explicit release.
 */
let locked = false
let lockId: string | null = null

export function acquireSubmitLock(id: string): boolean {
  if (locked) return false
  locked = true
  lockId = id
  return true
}

export function releaseSubmitLock(id: string): void {
  if (lockId === id) {
    locked = false
    lockId = null
  }
}

export function isSubmitLocked(): boolean {
  return locked
}

export function generateLockId(): string {
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// ── Error classification ───────────────────────────────────────────────────

export type SwapErrorCode =
  | 'USER_REJECTED'
  | 'WALLET_TAB_INACTIVE'
  | 'RPC_RATE_LIMITED'
  | 'RPC_UNAVAILABLE'
  | 'RPC_TIMEOUT'
  | 'WRONG_NETWORK'
  | 'INSUFFICIENT_ALLOWANCE'
  | 'INSUFFICIENT_BALANCE'
  | 'SIMULATION_REVERTED'
  | 'SWAP_REVERTED'
  | 'APPROVAL_FAILED'
  | 'UNKNOWN'

export type SwapError = {
  code: SwapErrorCode
  message: string
  devDetails?: Record<string, unknown>
}

function getErrorField(error: unknown, field: string): unknown {
  if (!error || typeof error !== 'object') return undefined
  return (error as Record<string, unknown>)[field]
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

/**
 * Walk the error.cause chain (up to 6 levels) to extract a revert reason.
 */
function getNestedRevertReason(error: unknown): string | undefined {
  let cause: unknown = error
  for (let i = 0; i < 6 && cause; i++) {
    const reason = str(getErrorField(cause, 'reason'))
    if (reason) return reason
    cause = getErrorField(cause, 'cause')
  }
  return undefined
}

/**
 * Classify an error from a wallet write or RPC call into a typed SwapError.
 *
 * Priority order (checked first → last):
 *   1. User rejection
 *   2. Tab inactive / wallet unavailable
 *   3. Contract revert / custom error
 *   4. Wrong network
 *   5. HTTP 429 / rate limit
 *   6. Timeout
 *   7. Generic network error
 */
export function classifySwapError(error: unknown, context?: { router?: string; chainId?: number; method?: string }): SwapError {
  const name = str(getErrorField(error, 'name')) ?? ''
  const shortMessage = str(getErrorField(error, 'shortMessage')) ?? ''
  const details = str(getErrorField(error, 'details')) ?? ''
  const causeShort = str(getErrorField(getErrorField(error, 'cause'), 'shortMessage')) ?? ''
  const revertReason = getNestedRevertReason(error) ?? ''
  const raw = error instanceof Error ? error.message : str(error) ?? ''

  const combined = [name, shortMessage, details, causeShort, revertReason, raw].join(' ')
  const n = combined.toLowerCase()

  const devDetails = import.meta.env.DEV
    ? { router: context?.router, chainId: context?.chainId, method: context?.method, name, shortMessage, details, causeShort, revertReason, raw }
    : undefined

  // 1. User rejection
  if (n.includes('user rejected') || n.includes('rejected') || n.includes('denied') || n.includes('cancelled') || n.includes('canceled')) {
    return { code: 'USER_REJECTED', message: 'Rejected by user', devDetails }
  }

  // 2. Tab inactive / wallet unavailable
  if (n.includes('tab') && (n.includes('inactive') || n.includes('not active') || n.includes('not available'))) {
    return { code: 'WALLET_TAB_INACTIVE', message: 'Return to this tab, then try again.', devDetails }
  }
  if (n.includes('requested resource not available')) {
    return { code: 'WALLET_TAB_INACTIVE', message: 'Return to this tab, then try again.', devDetails }
  }
  if (n.includes('resource not available') || n.includes('provider not available') || n.includes('not connected')) {
    return { code: 'WALLET_TAB_INACTIVE', message: 'Wallet not available. Return to this tab and try again.', devDetails }
  }

  // 3. Contract revert (check BEFORE HTTP/network to avoid misclassification)
  if (revertReason) {
    const r = revertReason.toLowerCase()
    if (r.includes('allowance') || r.includes('transfer amount exceeds allowance')) {
      return { code: 'INSUFFICIENT_ALLOWANCE', message: 'Insufficient allowance — approve the router first', devDetails }
    }
    if (r.includes('insufficient balance') || r.includes('exceeds balance')) {
      return { code: 'INSUFFICIENT_BALANCE', message: 'Insufficient token balance', devDetails }
    }
    return { code: 'SIMULATION_REVERTED', message: `Swap reverted: ${revertReason}`, devDetails }
  }
  if (n.includes('execution reverted') || n.includes('reverted')) {
    const reason = details || causeShort || shortMessage
    return { code: 'SIMULATION_REVERTED', message: reason ? `Swap reverted: ${reason}` : 'Swap simulation reverted', devDetails }
  }

  // 4. Wrong network
  if (n.includes('wrong network') || n.includes('chain mismatch') || n.includes('unrecognized chain')) {
    return { code: 'WRONG_NETWORK', message: 'Wrong network — switch to Arc Testnet', devDetails }
  }

  // 5. HTTP 429 / rate limit
  if (n.includes('429') || n.includes('rate limit') || n.includes('request limit') || n.includes('too many requests')) {
    return { code: 'RPC_RATE_LIMITED', message: 'RPC is busy. Please wait a moment and try again.', devDetails }
  }

  // 6. Timeout
  if (n.includes('timeout') || n.includes('timed out')) {
    return { code: 'RPC_TIMEOUT', message: 'Request timed out — try again', devDetails }
  }

  // 7. Generic network
  if (n.includes('http request failed') || n.includes('rpc request failed') || n.includes('fetch failed')) {
    return { code: 'RPC_UNAVAILABLE', message: 'RPC unavailable — check your connection and try again', devDetails }
  }

  // Fallback
  const fallback = shortMessage || causeShort || details || revertReason || raw
  // Truncate to first line, max 150 chars — no stack traces or viem version
  const firstLine = (fallback || 'Unknown error').split('\n')[0] ?? 'Unknown error'
  return { code: 'UNKNOWN', message: firstLine.length > 150 ? firstLine.slice(0, 150) + '…' : firstLine, devDetails }
}
