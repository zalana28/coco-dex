import { useState, useCallback } from 'react'
import { validateSlippage, validateDeadline } from '@/utils/validation'

/**
 * Approval mode type.
 * - 'exact': approves only the current input amount (safer, requires re-approval each swap)
 * - 'max': approves max uint256 (better UX, one-time approval per token)
 */
export type ApprovalMode = 'exact' | 'max'

/**
 * LocalStorage keys for persisted settings.
 */
const STORAGE_KEYS = {
  SLIPPAGE: 'coco-dex:slippage',
  DEADLINE: 'coco-dex:deadline',
  APPROVAL_MODE: 'coco-dex:approval-mode',
} as const

/**
 * Default values for swap settings.
 */
export const SLIPPAGE_DEFAULT = 0.5 // 0.5%
export const SLIPPAGE_MIN = 0.01 // 0.01%
export const SLIPPAGE_MAX = 5 // 5%
export const SLIPPAGE_PRESETS = [0.1, 0.5, 1.0] as const

export const DEADLINE_DEFAULT = 20 // 20 minutes
export const DEADLINE_MIN = 1
export const DEADLINE_MAX = 180

export const APPROVAL_MODE_DEFAULT: ApprovalMode = 'max'

/**
 * Read a numeric value from localStorage with validation.
 */
function readStoredNumber(key: string, fallback: number, validate: (v: number) => boolean): number {
  try {
    const stored = localStorage.getItem(key)
    if (stored === null) return fallback
    const parsed = parseFloat(stored)
    if (isNaN(parsed) || !validate(parsed)) return fallback
    return parsed
  } catch {
    return fallback
  }
}

/**
 * Hook for managing slippage tolerance with localStorage persistence.
 *
 * Enforces:
 * - Minimum: 0.01%
 * - Maximum: 5%
 * - Default: 0.5%
 */
export function useSlippage() {
  const [slippage, setSlippageRaw] = useState<number>(() =>
    readStoredNumber(STORAGE_KEYS.SLIPPAGE, SLIPPAGE_DEFAULT, (v) => v >= SLIPPAGE_MIN && v <= SLIPPAGE_MAX)
  )

  const setSlippage = useCallback((value: number) => {
    const result = validateSlippage(value)
    if (!result.valid) return result.error

    setSlippageRaw(value)
    try {
      localStorage.setItem(STORAGE_KEYS.SLIPPAGE, value.toString())
    } catch {
      // localStorage might be unavailable; continue with in-memory value
    }
    return null
  }, [])

  /** Convert slippage percentage to basis points for contract calls */
  const slippageBps = Math.round(slippage * 100)

  return {
    slippage,
    slippageBps,
    setSlippage,
    isHighSlippage: slippage > 1,
    isVeryHighSlippage: slippage > 3,
  }
}

/**
 * Hook for managing transaction deadline with localStorage persistence.
 *
 * Enforces:
 * - Minimum: 1 minute
 * - Maximum: 180 minutes
 * - Default: 20 minutes
 */
export function useDeadline() {
  const [deadline, setDeadlineRaw] = useState<number>(() =>
    readStoredNumber(STORAGE_KEYS.DEADLINE, DEADLINE_DEFAULT, (v) => v >= DEADLINE_MIN && v <= DEADLINE_MAX && Number.isInteger(v))
  )

  const setDeadline = useCallback((minutes: number) => {
    const result = validateDeadline(minutes)
    if (!result.valid) return result.error

    setDeadlineRaw(minutes)
    try {
      localStorage.setItem(STORAGE_KEYS.DEADLINE, minutes.toString())
    } catch {
      // localStorage might be unavailable; continue with in-memory value
    }
    return null
  }, [])

  /** Get the deadline as a Unix timestamp (seconds) for contract calls */
  const getDeadlineTimestamp = useCallback(() => {
    return Math.floor(Date.now() / 1000) + deadline * 60
  }, [deadline])

  return {
    deadline,
    setDeadline,
    getDeadlineTimestamp,
  }
}

/**
 * Hook for managing approval mode with localStorage persistence.
 *
 * - 'max': approve max uint256 (default, one-time approval per token)
 * - 'exact': approve only the current input amount (safer, repeated)
 */
export function useApprovalMode() {
  const [approvalMode, setApprovalModeRaw] = useState<ApprovalMode>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.APPROVAL_MODE)
      if (stored === 'exact' || stored === 'max') return stored
      return APPROVAL_MODE_DEFAULT
    } catch {
      return APPROVAL_MODE_DEFAULT
    }
  })

  const setApprovalMode = useCallback((mode: ApprovalMode) => {
    setApprovalModeRaw(mode)
    try {
      localStorage.setItem(STORAGE_KEYS.APPROVAL_MODE, mode)
    } catch {
      // localStorage might be unavailable; continue with in-memory value
    }
  }, [])

  return {
    approvalMode,
    setApprovalMode,
  }
}

/**
 * Combined hook for all transaction settings.
 */
export function useTransactionSettings() {
  const slippageState = useSlippage()
  const deadlineState = useDeadline()
  const approvalModeState = useApprovalMode()

  return {
    ...slippageState,
    ...deadlineState,
    ...approvalModeState,
  }
}
