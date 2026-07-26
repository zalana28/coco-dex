/* @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useTransactionProgress } from './useTransactionProgress'

/**
 * Covers the two-field failure model added for error visibility: a step carries
 * a short summary for the collapsed row *and* the untruncated provider string
 * behind the Details disclosure.
 */

function startSwapFlow() {
  const hook = renderHook(() => useTransactionProgress())
  act(() => {
    hook.result.current.startFlow([{ type: 'swap', label: 'Swap' }])
  })
  act(() => {
    hook.result.current.markWaiting('swap')
  })
  return hook
}

function swapStep(result: { current: ReturnType<typeof useTransactionProgress> }) {
  return result.current.currentFlow?.steps.find((s) => s.type === 'swap')
}

describe('useTransactionProgress — failure detail', () => {
  it('keeps the short summary and the full detail separately', () => {
    const { result } = startSwapFlow()
    const rawProviderError =
      'The contract function "swapExactTokensForTokens" reverted.\n\nDetails: execution reverted: INSUFFICIENT_OUTPUT_AMOUNT\nVersion: viem@2.51.0'

    act(() => {
      result.current.markFailed('swap', 'Swap reverted: INSUFFICIENT_OUTPUT_AMOUNT', rawProviderError)
    })

    const step = swapStep(result)
    expect(step?.status).toBe('failed')
    expect(step?.error).toBe('Swap reverted: INSUFFICIENT_OUTPUT_AMOUNT')
    // The full string is preserved verbatim — nothing is sliced away.
    expect(step?.errorDetail).toBe(rawProviderError)
    expect(step?.errorDetail).toContain('INSUFFICIENT_OUTPUT_AMOUNT')
  })

  it('omits the detail when it would merely repeat the summary', () => {
    const { result } = startSwapFlow()

    act(() => {
      result.current.markFailed('swap', 'Rejected by user', 'Rejected by user')
    })

    expect(swapStep(result)?.errorDetail).toBeUndefined()
  })

  it('omits the detail when none is supplied', () => {
    const { result } = startSwapFlow()

    act(() => {
      result.current.markFailed('swap', 'Transaction reverted')
    })

    const step = swapStep(result)
    expect(step?.error).toBe('Transaction reverted')
    expect(step?.errorDetail).toBeUndefined()
  })

  it('clears both fields when the step is reset for retry', () => {
    const { result } = startSwapFlow()

    act(() => {
      result.current.markFailed('swap', 'Swap reverted', 'long raw provider string')
    })
    act(() => {
      result.current.resetStep('swap')
    })

    const step = swapStep(result)
    expect(step?.status).toBe('idle')
    expect(step?.error).toBeUndefined()
    expect(step?.errorDetail).toBeUndefined()
  })

  it('does not overwrite a step that already succeeded', () => {
    const { result } = startSwapFlow()

    act(() => {
      result.current.markSuccess('swap')
    })
    act(() => {
      result.current.markFailed('swap', 'late failure', 'raw')
    })

    const step = swapStep(result)
    expect(step?.status).toBe('success')
    expect(step?.errorDetail).toBeUndefined()
  })
})
