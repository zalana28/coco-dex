import { useState, useCallback } from 'react'
import type { TransactionStep, TransactionType, TransactionStatus, TransactionFlow } from '@/types/transactions'

let flowIdCounter = 0

/**
 * Hook for managing multi-step transaction progress.
 *
 * Tracks a flow of sequential transaction steps (e.g., approve → swap)
 * and maintains a history of the latest completed flows.
 *
 * Usage:
 *   const progress = useTransactionProgress()
 *   progress.startFlow([{ type: 'approve_usdc', label: 'Approve USDC' }])
 *   progress.updateStep('approve_usdc', 'waiting_wallet_confirmation')
 *   progress.setTxHash('approve_usdc', '0x...')
 *   progress.updateStep('approve_usdc', 'success')
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
   * Update the status of a step by its type.
   */
  const updateStep = useCallback((type: TransactionType, status: TransactionStatus, error?: string) => {
    setCurrentFlow((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        steps: prev.steps.map((step) =>
          step.type === type
            ? { ...step, status, error, timestamp: Date.now() }
            : step
        ),
      }
    })
  }, [])

  /**
   * Set the tx hash for a step once it's submitted to the network.
   */
  const setTxHash = useCallback((type: TransactionType, txHash: `0x${string}`) => {
    setCurrentFlow((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        steps: prev.steps.map((step) =>
          step.type === type
            ? { ...step, txHash, status: 'pending_onchain' as TransactionStatus, timestamp: Date.now() }
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
   * Get the active (non-idle, non-success) step in the current flow.
   */
  const activeStep = currentFlow?.steps.find(
    (s) => s.status !== 'idle' && s.status !== 'success'
  ) ?? null

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
    isFlowComplete,
    hasError,
    startFlow,
    updateStep,
    setTxHash,
    clearFlow,
    reset,
  }
}
