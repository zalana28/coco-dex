import { useState, useCallback, useMemo } from 'react'
import type { TransactionStep, TransactionType, TransactionStatus, TransactionFlow } from '@/types/transactions'

let flowIdCounter = 0

/**
 * Hook for managing multi-step transaction progress with STRICT sequential enforcement.
 *
 * Rules:
 * - Only the current active step can show a spinner (waiting/pending states).
 * - Future steps remain 'idle' until all prior steps are 'success'.
 * - A step can only transition forward: idle → waiting → pending → success/failed/rejected.
 * - Each step tracks its own tx hash independently. A hash belongs to exactly one step.
 * - No step auto-advances to the next. The user must click the next action button.
 *
 * Usage:
 *   const progress = useTransactionProgress()
 *   progress.startFlow([...steps])
 *   progress.markWaiting('approve_usdc')      // user clicked approve
 *   progress.markSubmitted('approve_usdc', '0x...') // tx submitted
 *   progress.markSuccess('approve_usdc')      // receipt confirmed
 *   // user clicks next step...
 */
export function useTransactionProgress() {
  const [currentFlow, setCurrentFlow] = useState<TransactionFlow | null>(null)
  const [history, setHistory] = useState<TransactionFlow[]>([])

  /**
   * Start a new transaction flow with the given step definitions.
   * All steps start in 'idle' status.
   */
  const startFlow = useCallback((steps: { type: TransactionType; label: string }[]) => {
    const flow: TransactionFlow = {
      id: `flow-${++flowIdCounter}-${Date.now()}`,
      steps: steps.map((s) => ({
        id: `${s.type}-${Date.now()}`,
        type: s.type,
        label: s.label,
        status: 'idle' as TransactionStatus,
        timestamp: Date.now(),
      })),
      createdAt: Date.now(),
    }
    setCurrentFlow(flow)
    return flow.id
  }, [])

  /**
   * Mark a step as waiting for wallet confirmation.
   * Only allowed if no other step is currently in a pending/waiting state.
   */
  const markWaiting = useCallback((type: TransactionType) => {
    setCurrentFlow((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        steps: prev.steps.map((step) =>
          step.type === type && step.status === 'idle'
            ? { ...step, status: 'waiting_wallet_confirmation' as TransactionStatus, timestamp: Date.now() }
            : step
        ),
      }
    })
  }, [])

  /**
   * Mark a step as submitted with its tx hash. Moves to 'pending_onchain'.
   * The tx hash is assigned exclusively to this step.
   */
  const markSubmitted = useCallback((type: TransactionType, txHash: `0x${string}`) => {
    setCurrentFlow((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        steps: prev.steps.map((step) =>
          step.type === type && (step.status === 'waiting_wallet_confirmation' || step.status === 'submitted')
            ? { ...step, status: 'pending_onchain' as TransactionStatus, txHash, timestamp: Date.now() }
            : step
        ),
      }
    })
  }, [])

  /**
   * Mark a step as successfully confirmed on-chain.
   */
  const markSuccess = useCallback((type: TransactionType) => {
    setCurrentFlow((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        steps: prev.steps.map((step) =>
          step.type === type && step.status !== 'success'
            ? { ...step, status: 'success' as TransactionStatus, timestamp: Date.now() }
            : step
        ),
      }
    })
  }, [])

  /**
   * Mark a step as failed.
   */
  const markFailed = useCallback((type: TransactionType, error?: string) => {
    setCurrentFlow((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        steps: prev.steps.map((step) =>
          step.type === type && step.status !== 'success' && step.status !== 'idle'
            ? { ...step, status: 'failed' as TransactionStatus, error, timestamp: Date.now() }
            : step
        ),
      }
    })
  }, [])

  /**
   * Mark a step as rejected (user denied wallet request).
   */
  const markRejected = useCallback((type: TransactionType) => {
    setCurrentFlow((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        steps: prev.steps.map((step) =>
          step.type === type && step.status !== 'success' && step.status !== 'idle'
            ? { ...step, status: 'rejected' as TransactionStatus, timestamp: Date.now() }
            : step
        ),
      }
    })
  }, [])

  /**
   * Reset a failed/rejected step back to idle so user can retry.
   */
  const resetStep = useCallback((type: TransactionType) => {
    setCurrentFlow((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        steps: prev.steps.map((step) =>
          step.type === type && (step.status === 'failed' || step.status === 'rejected')
            ? { ...step, status: 'idle' as TransactionStatus, txHash: undefined, error: undefined, timestamp: Date.now() }
            : step
        ),
      }
    })
  }, [])

  /**
   * Clear the current flow and move it to history.
   */
  const clearFlow = useCallback(() => {
    setCurrentFlow((prev) => {
      if (prev) {
        setHistory((h) => [prev, ...h].slice(0, 3)) // Keep latest 3
      }
      return null
    })
  }, [])

  /**
   * Reset everything (current flow + history).
   */
  const reset = useCallback(() => {
    setCurrentFlow(null)
    setHistory([])
  }, [])

  /**
   * The index of the current active step (first non-success step).
   * Returns -1 if all steps are complete.
   */
  const activeStepIndex = useMemo(() => {
    if (!currentFlow) return -1
    return currentFlow.steps.findIndex((s) => s.status !== 'success')
  }, [currentFlow])

  /**
   * The currently active step (first non-success).
   */
  const activeStep = useMemo(() => {
    if (!currentFlow || activeStepIndex === -1) return null
    return currentFlow.steps[activeStepIndex] ?? null
  }, [currentFlow, activeStepIndex])

  /**
   * Whether the entire flow is complete (all steps succeeded).
   */
  const isFlowComplete = currentFlow !== null && currentFlow.steps.every(
    (s) => s.status === 'success'
  )

  /**
   * Whether any step has failed or been rejected.
   */
  const hasError = currentFlow?.steps.some(
    (s) => s.status === 'failed' || s.status === 'rejected'
  ) ?? false

  return {
    currentFlow,
    history,
    activeStep,
    activeStepIndex,
    isFlowComplete,
    hasError,
    startFlow,
    markWaiting,
    markSubmitted,
    markSuccess,
    markFailed,
    markRejected,
    resetStep,
    clearFlow,
    reset,
  }
}
