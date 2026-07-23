import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BridgeResult } from '@circle-fin/bridge-kit'
import { canonicalStepName, createBridgeAttempt, deriveOverallState, normalizeBridgeSteps, type LifecycleStepName } from './attempt'
import {
  applyPoll,
  applyReceiptReverted,
  applyReceiptSuccess,
  applyReceiptUnknown,
  applySnapshot,
  applyTerminalError,
  applyTxHash,
  resumeAfterBurn,
} from './lifecycle'
import { subscribeBridgeEvents } from './events'
import { pollAttestation, type AttestationPollResult } from './iris'

function resultWith(steps: BridgeResult['steps']): BridgeResult {
  return {
    amount: '10', token: 'USDC', state: 'pending', provider: 'CCTPV2BridgingProvider',
    source: { address: '0x1', chain: 'Ethereum_Sepolia' as never },
    destination: { address: '0x2', chain: 'Arc_Testnet' as never, recipientAddress: '0x2', useForwarder: true },
    steps,
  }
}

describe('semantic step normalization (no array-index mapping)', () => {
  it('maps arbitrary SDK step names to canonical lifecycle steps', () => {
    expect(canonicalStepName('approve')).toBe('approve')
    expect(canonicalStepName('depositForBurn')).toBe('burn')
    expect(canonicalStepName('customBurn')).toBe('burn')
    expect(canonicalStepName('fetchAttestation')).toBe('attestation')
    expect(canonicalStepName('attestation')).toBe('attestation')
    expect(canonicalStepName('forward')).toBe('forwarded-mint')
    expect(canonicalStepName('receiveMessage')).toBe('forwarded-mint')
    expect(canonicalStepName('mint')).toBe('forwarded-mint')
  })

  it('an omitted approval does not shift Burn', () => {
    const result = resultWith([
      { name: 'burn', state: 'success', txHash: '0xdead' },
      { name: 'fetchAttestation', state: 'success' },
      { name: 'mint', state: 'success', txHash: '0xbeef', forwarded: true },
    ])
    const steps = normalizeBridgeSteps(result)
    expect(steps.burn.txHash).toBe('0xdead')
    expect(steps.burn.state).toBe('success')
    expect(steps.approve.state).toBe('not-started')
  })

  it('a noop approval does not shift Burn', () => {
    const result = resultWith([
      { name: 'approve', state: 'noop' },
      { name: 'burn', state: 'success', txHash: '0xdead' },
    ])
    const steps = normalizeBridgeSteps(result)
    expect(steps.approve.state).toBe('noop')
    expect(steps.burn.txHash).toBe('0xdead')
  })

  it('an extra SDK step does not shift Attestation', () => {
    const result = resultWith([
      { name: 'approve', state: 'success' },
      { name: 'burn', state: 'success', txHash: '0xdead' },
      { name: 'someInfoStep', state: 'success' },
      { name: 'fetchAttestation', state: 'success' },
    ])
    const steps = normalizeBridgeSteps(result)
    expect(steps.attestation.state).toBe('success')
  })

  it('reordered SDK steps remain correct', () => {
    const result = resultWith([
      { name: 'mint', state: 'success', txHash: '0xbeef', forwarded: true },
      { name: 'burn', state: 'success', txHash: '0xdead' },
      { name: 'approve', state: 'success' },
      { name: 'fetchAttestation', state: 'success' },
    ])
    const steps = normalizeBridgeSteps(result)
    expect(steps.burn.txHash).toBe('0xdead')
    expect(steps['forwarded-mint'].txHash).toBe('0xbeef')
  })

  it('attestation error never appears as Burn failed', () => {
    const result = resultWith([
      { name: 'approve', state: 'success' },
      { name: 'burn', state: 'success', txHash: '0xdead' },
      { name: 'fetchAttestation', state: 'error', errorMessage: 'attestation timeout' },
    ])
    const steps = normalizeBridgeSteps(result)
    expect(steps.burn.state).toBe('success')
    expect(steps.attestation.state).toBe('retryable-error')
  })

  it('forwarding error never appears as Burn or Attestation failed', () => {
    const result = resultWith([
      { name: 'approve', state: 'success' },
      { name: 'burn', state: 'success', txHash: '0xdead' },
      { name: 'fetchAttestation', state: 'success' },
      { name: 'mint', state: 'error', errorMessage: 'forwarding timeout' },
    ])
    const steps = normalizeBridgeSteps(result)
    expect(steps.burn.state).toBe('success')
    expect(steps.attestation.state).toBe('success')
    expect(steps['forwarded-mint'].state).toBe('retryable-error')
  })
})

describe('lifecycle reducers', () => {
  function fresh(): ReturnType<typeof createBridgeAttempt> {
    return createBridgeAttempt({ account: '0x1', source: 'Ethereum_Sepolia', sourceChainId: 11155111, sourceDomain: 0, recipient: '0x2', amount: '10', transferSpeed: 'SLOW', useForwarder: true })
  }

  it('applyTxHash captures the burn hash immediately by name', () => {
    const next = applyTxHash(fresh(), 'burn', '0xdead')
    expect(next.steps.burn.txHash).toBe('0xdead')
    expect(next.steps.burn.state).toBe('submitted')
  })

  it('a successful burn receipt overrides an SDK timeout/error', () => {
    let a = applyTerminalError(fresh(), 'burn', 'Bridge operation failed')
    a = applyReceiptSuccess(a, 'burn')
    expect(a.steps.burn.state).toBe('success')
    expect(a.steps.burn.receiptStatus).toBe('success')
  })

  it('a reverted burn receipt becomes a terminal failure', () => {
    const a = applyReceiptReverted(fresh(), 'burn')
    expect(a.steps.burn.state).toBe('terminal-error')
    expect(a.steps.burn.receiptStatus).toBe('reverted')
    expect(a.overallState).toBe('terminal-error')
  })

  it('a temporarily unavailable receipt becomes unknown-checking', () => {
    const a = applyReceiptUnknown(fresh(), 'burn')
    expect(a.steps.burn.state).toBe('unknown-checking')
    expect(a.overallState).toBe('unknown-checking')
  })

  it('resumeAfterBurn never repeats the burn', () => {
    const a = applyTxHash(fresh(), 'burn', '0xdead')
    const resumed = resumeAfterBurn(a)
    expect(resumed.steps.burn.state).toBe('success')
    expect(resumed.steps.burn.txHash).toBe('0xdead')
    expect(resumed.steps.attestation.state).toBe('waiting')
  })

  it('HTTP 404 / empty message / pending remain waiting', () => {
    const cases: AttestationPollResult[] = [
      { status: 'pending' },
      { status: 'attestation-pending' },
    ]
    for (const poll of cases) {
      const a = applyPoll(fresh(), poll)
      expect(a.steps.attestation.state).not.toBe('terminal-error')
      expect(a.overallState).not.toBe('terminal-error')
    }
  })

  it('attestation available updates lifecycle', () => {
    const a = applyPoll(fresh(), { status: 'attestation-available' })
    expect(a.steps.attestation.state).toBe('success')
  })

  it('forwarding queued then pending updates lifecycle', () => {
    let a = applyPoll(fresh(), { status: 'forwarding-queued' })
    expect(a.steps['forwarded-mint'].state).toBe('waiting')
    a = applyPoll(a, { status: 'forwarding-pending' })
    expect(a.steps['forwarded-mint'].state).toBe('submitted')
  })

  it('forwardTxHash is stored and creates an Arcscan link', () => {
    const a = applyPoll(fresh(), { status: 'complete', forwardTxHash: '0xabc', message: 'm' })
    expect(a.steps['forwarded-mint'].txHash).toBe('0xabc')
    expect(a.steps['forwarded-mint'].explorerUrl).toBe('https://testnet.arcscan.app/tx/0xabc')
    expect(a.overallState).toBe('complete')
  })

  it('snapshot preserves event-captured hashes', () => {
    let a = applyTxHash(fresh(), 'burn', '0xdead')
    const result = resultWith([{ name: 'burn', state: 'success' }])
    a = applySnapshot(a, result)
    expect(a.steps.burn.txHash).toBe('0xdead')
  })
})

describe('event subscription correlation', () => {
  it('registers before bridge and correlates by traceId', () => {
    const kit = { on: vi.fn(), off: vi.fn() } as unknown as import('@circle-fin/bridge-kit').BridgeKit
    const onEvent = vi.fn()
    const unsub = subscribeBridgeEvents(kit, 'attempt1', 'trace123', { onEvent })
    expect(kit.on).toHaveBeenCalledWith('*', expect.any(Function))
    const handler = (kit.on as ReturnType<typeof vi.fn>).mock.calls[0]![1] as (p: unknown) => void
    // Matching trace → emitted
    handler({ method: 'burn', values: { txHash: '0xdead', traceId: 'trace123' } })
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ attemptId: 'attempt1', stepName: 'burn', txHash: '0xdead' }))
    // Stale trace from old attempt → ignored
    onEvent.mockClear()
    handler({ method: 'burn', values: { txHash: '0xold', traceId: 'other' } })
    expect(onEvent).not.toHaveBeenCalled()
    unsub()
    expect(kit.off).toHaveBeenCalled()
  })

  it('a stale event from attempt A cannot overwrite attempt B', () => {
    const kit = { on: vi.fn(), off: vi.fn() } as unknown as import('@circle-fin/bridge-kit').BridgeKit
    const seen: string[] = []
    subscribeBridgeEvents(kit, 'B', 'traceB', { onEvent: (i) => seen.push(`${i.attemptId}:${i.txHash}`) })
    const handler = (kit.on as ReturnType<typeof vi.fn>).mock.calls[0]![1] as (p: unknown) => void
    handler({ method: 'burn', values: { txHash: '0xA', traceId: 'traceA' } })
    handler({ method: 'burn', values: { txHash: '0xB', traceId: 'traceB' } })
    expect(seen).toEqual(['B:0xB'])
  })
})

describe('Iris attestation interpretation', () => {
  const orig = globalThis.fetch
  afterEach(() => { globalThis.fetch = orig })
  function mockFetch(body: unknown, status = 200) {
    globalThis.fetch = vi.fn().mockResolvedValue({ status, ok: status < 400, json: async () => body }) as never
  }
  it('404 stays pending', async () => {
    mockFetch({}, 404)
    const r = await pollAttestation(0, '0xdead')
    expect(r.status).toBe('pending')
  })
  it('empty messages stays pending', async () => {
    mockFetch({ messages: [] })
    const r = await pollAttestation(0, '0xdead')
    expect(r.status).toBe('pending')
  })
  it('attestation available', async () => {
    mockFetch({ messages: [{ message: 'm', attestationStatus: 'COMPLETE' }] })
    const r = await pollAttestation(0, '0xdead')
    expect(r.status).toBe('attestation-available')
  })
  it('forwarding pending surfaces forwardTxHash', async () => {
    mockFetch({ messages: [{ message: 'm', attestationStatus: 'COMPLETE', forwardingStatus: 'PENDING', destinationTxHash: '0xforward' }] })
    const r = await pollAttestation(0, '0xdead')
    expect(r.status).toBe('forwarding-pending')
    expect(r.forwardTxHash).toBe('0xforward')
  })
})

describe('deriveOverallState', () => {
  it('maps step states to overall state', () => {
    const mk = (states: Record<LifecycleStepName, string>) => {
      const steps = createBridgeAttempt({ account: '0x1', source: 'Ethereum_Sepolia', sourceChainId: 11155111, sourceDomain: 0, recipient: '0x2', amount: '10', transferSpeed: 'SLOW', useForwarder: true }).steps
      for (const name of Object.keys(steps) as LifecycleStepName[]) {
        steps[name] = { ...steps[name], state: states[name] as never }
      }
      return steps
    }
    expect(deriveOverallState(mk({ approve: 'success', burn: 'success', attestation: 'success', 'forwarded-mint': 'success' })).overall).toBe('complete')
    expect(deriveOverallState(mk({ approve: 'success', burn: 'success', attestation: 'waiting', 'forwarded-mint': 'not-started' })).overall).toBe('waiting-attestation')
    expect(deriveOverallState(mk({ approve: 'success', burn: 'success', attestation: 'success', 'forwarded-mint': 'submitted' })).overall).toBe('forwarding')
    expect(deriveOverallState(mk({ approve: 'success', burn: 'terminal-error', attestation: 'not-started', 'forwarded-mint': 'not-started' })).overall).toBe('terminal-error')
  })
})
