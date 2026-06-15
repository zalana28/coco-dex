/* @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { CocoStableRemoveLiquidityPanel } from './CocoStableRemoveLiquidityPanel'

// The panel only needs to render its non-pending UI for these checks; wagmi
// hooks are stubbed so no wallet/network is required. The key contract under
// test is that in every non-transaction state the panel reports
// onPendingChange(false), which is what lets the parent modal stay closable.
vi.mock('wagmi', () => ({
  useAccount: () => ({ address: undefined, isConnected: false }),
  useChainId: () => 5_042_002,
  usePublicClient: () => undefined,
  useWriteContract: () => ({ writeContract: vi.fn(), isPending: false }),
}))

vi.mock('@/hooks/useTokenBalance', () => ({
  useTokenBalance: () => ({ data: undefined, refetch: vi.fn() }),
}))

vi.mock('@/hooks/useTransactionProgress', () => ({
  useTransactionProgress: () => ({
    activeStep: undefined,
    currentFlow: null,
    history: [],
    isFlowComplete: false,
    hasError: false,
    startFlow: vi.fn(),
    resetStep: vi.fn(),
    markWaiting: vi.fn(),
    markSubmitted: vi.fn(),
    markSuccess: vi.fn(),
    markFailed: vi.fn(),
    markRejected: vi.fn(),
    clearFlow: vi.fn(),
  }),
}))

const baseProps = {
  reserve0: 1_000_000n,
  reserve1: 1_000_000n,
  totalSupply: 1_000_000n,
  lpDecimals: 18,
  paused: false,
  onRefreshPool: vi.fn(),
}

describe('CocoStableRemoveLiquidityPanel — never traps the modal', () => {
  beforeEach(() => cleanup())

  it('reports not-pending in the output-estimate-unavailable / no-input state', () => {
    const onPendingChange = vi.fn()
    render(
      <CocoStableRemoveLiquidityPanel
        {...baseProps}
        userLpBalance={0n}
        onPendingChange={onPendingChange}
      />,
    )

    // The primary action is disabled in this non-pending state ...
    const actionButton = screen.getByRole('button', { name: /Connect Wallet|Output estimate unavailable|Enter cSLP amount|Enter Amounts|Insufficient cSLP/i })
    expect(actionButton).toBeTruthy()
    // ... but the panel must NOT signal a pending transaction, so the modal
    // remains closable via X / Escape / backdrop / footer.
    expect(onPendingChange).toHaveBeenCalled()
    expect(onPendingChange).toHaveBeenLastCalledWith(false)
    expect(onPendingChange).not.toHaveBeenCalledWith(true)
  })

  it('keeps beta safety badges visible (Beta / Unaudited / Not routed)', () => {
    render(<CocoStableRemoveLiquidityPanel {...baseProps} userLpBalance={0n} />)
    expect(screen.getByText('LP Beta')).toBeTruthy()
    expect(screen.getByText('Unaudited')).toBeTruthy()
    expect(screen.getByText('Not routed')).toBeTruthy()
  })

  it('collapses advanced technical rows behind a Details disclosure by default', () => {
    render(<CocoStableRemoveLiquidityPanel {...baseProps} userLpBalance={0n} />)
    // Advanced details live inside a <details> element (collapsed by default).
    const summary = screen.getByText('Advanced details')
    const details = summary.closest('details')
    expect(details).not.toBeNull()
    expect(details?.open).toBe(false)
  })
})
