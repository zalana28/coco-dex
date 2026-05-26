import { useState, useCallback } from 'react'

/**
 * Toast notification types for transaction lifecycle.
 */
export type ToastType = 'pending' | 'success' | 'error' | 'info'

export interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  /** Optional explorer link for the transaction */
  txHash?: string
  /** Auto-dismiss after this many ms (default: 5000, 0 = no auto-dismiss) */
  duration: number
}

let toastIdCounter = 0

/**
 * Hook for managing toast notifications.
 *
 * Provides a simple interface for showing transaction state notifications:
 * - pending: Transaction submitted, waiting for confirmation
 * - success: Transaction confirmed
 * - error: Transaction failed or rejected
 * - info: General information
 *
 * Toasts auto-dismiss after 5 seconds by default.
 * Pending toasts do not auto-dismiss (duration = 0).
 */
export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((
    type: ToastType,
    title: string,
    options: { message?: string; txHash?: string; duration?: number } = {}
  ) => {
    const id = `toast-${++toastIdCounter}-${Date.now()}`
    const duration = options.duration ?? (type === 'pending' ? 0 : 5000)

    const toast: Toast = {
      id,
      type,
      title,
      message: options.message,
      txHash: options.txHash,
      duration,
    }

    setToasts((prev) => [...prev, toast])

    // Auto-dismiss
    if (duration > 0) {
      setTimeout(() => {
        dismissToast(id)
      }, duration)
    }

    return id
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const dismissAll = useCallback(() => {
    setToasts([])
  }, [])

  // Convenience methods for transaction lifecycle
  const txPending = useCallback((title: string, txHash?: string) => {
    return addToast('pending', title, { txHash, message: 'Waiting for confirmation...' })
  }, [addToast])

  const txSuccess = useCallback((title: string, txHash?: string) => {
    return addToast('success', title, { txHash, message: 'Transaction confirmed' })
  }, [addToast])

  const txError = useCallback((title: string, message?: string) => {
    return addToast('error', title, { message: message ?? 'Transaction failed', duration: 8000 })
  }, [addToast])

  return {
    toasts,
    addToast,
    dismissToast,
    dismissAll,
    txPending,
    txSuccess,
    txError,
  }
}
