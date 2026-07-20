import type { BridgeResult } from '@circle-fin/bridge-kit'
import { normalizeBridgeSteps, type BridgeAttempt, type LifecycleStep, type LifecycleStepName } from './attempt'
import type { AttestationPollResult } from './iris'

/**
 * Pure lifecycle reducers. Each returns a NEW attempt (immutable update) so React
 * state and persistence stay consistent. No side effects, no I/O, no secrets.
 */

type StepPatch = Partial<LifecycleStep> & { name: LifecycleStepName }

function patchStep(attempt: BridgeAttempt, patch: StepPatch): BridgeAttempt {
  const now = Date.now()
  const updated: LifecycleStep = { ...attempt.steps[patch.name]!, ...patch, lastCheckedAt: now }
  const steps = { ...attempt.steps, [patch.name]: updated }
  return { ...attempt, steps, updatedAt: now }
}

function withDerived(attempt: BridgeAttempt): BridgeAttempt {
  const { overall, active } = deriveState(attempt.steps)
  return { ...attempt, overallState: overall, activeStep: active }
}

function deriveState(steps: BridgeAttempt['steps']): { overall: BridgeAttempt['overallState']; active?: LifecycleStepName } {
  const order: LifecycleStepName[] = ['approve', 'burn', 'attestation', 'forwarded-mint']
  for (const name of order) {
    const st = steps[name]!.state
    if (st === 'terminal-error') return { overall: 'terminal-error', active: name }
    if (st === 'retryable-error') return { overall: 'retryable-error', active: name }
  }
  for (const name of order) {
    const st = steps[name]!.state
    if (st === 'unknown-checking') return { overall: name === 'burn' ? 'unknown-checking' : name === 'attestation' ? 'waiting-attestation' : 'forwarding', active: name }
  }
  if (steps['forwarded-mint'].state === 'success') return { overall: 'complete' }
  for (const name of order) {
    if (steps[name]!.state === 'success') continue
    const activeMap = { approve: 'approving', burn: 'burning', attestation: 'waiting-attestation', 'forwarded-mint': 'minting' } as const
    if (name === 'forwarded-mint' && steps[name]!.state === 'submitted') return { overall: 'forwarding', active: name }
    return { overall: activeMap[name], active: name }
  }
  return { overall: 'complete' }
}

/** Apply the initial SDK snapshot after bridge() resolves (used as a backstop). */
export function applySnapshot(attempt: BridgeAttempt, result: BridgeResult): BridgeAttempt {
  const normalized = normalizeBridgeSteps(result)
  let next: BridgeAttempt = { ...attempt, bridgeResult: result, steps: normalized, updatedAt: Date.now() }
  // Preserve any tx hashes already captured by events (events are authoritative).
  for (const name of Object.keys(normalized) as LifecycleStepName[]) {
    const fromEvent = attempt.steps[name]?.txHash
    if (fromEvent && !normalized[name]!.txHash) {
      next = patchStep(next, { name, txHash: fromEvent })
    }
  }
  return withDerived(next)
}

/** Capture a transaction hash from a real SDK event, immediately and by name. */
export function applyTxHash(attempt: BridgeAttempt, stepName: LifecycleStepName, txHash: string, explorerUrl?: string): BridgeAttempt {
  const current = attempt.steps[stepName]!
  const patch: StepPatch = {
    name: stepName,
    txHash,
    ...(explorerUrl ? { explorerUrl } : {}),
    state: current.state === 'not-started' || current.state === 'awaiting-wallet' ? 'submitted' : current.state,
  }
  return withDerived(patchStep(attempt, patch))
}

/** Mark a step's wallet request has begun. */
export function applyAwaitingWallet(attempt: BridgeAttempt, stepName: LifecycleStepName): BridgeAttempt {
  return withDerived(patchStep(attempt, { name: stepName, state: 'awaiting-wallet' }))
}

/** Receipt confirmed successfully for a source tx hash. */
export function applyReceiptSuccess(attempt: BridgeAttempt, stepName: LifecycleStepName): BridgeAttempt {
  const patch: StepPatch = { name: stepName, state: 'success', receiptStatus: 'success', confirmedAt: Date.now() }
  const next = patchStep(attempt, patch)
  // A successful burn receipt overrides any prior SDK timeout/error for the burn step.
  return withDerived(next)
}

/** Receipt reverted / failed on-chain. */
export function applyReceiptReverted(attempt: BridgeAttempt, stepName: LifecycleStepName): BridgeAttempt {
  const patch: StepPatch = { name: stepName, state: 'terminal-error', receiptStatus: 'reverted', sanitizedMessage: 'Transaction reverted on-chain' }
  return withDerived(patchStep(attempt, patch))
}

/** Tx hash exists but receipt lookup temporarily unavailable → keep checking. */
export function applyReceiptUnknown(attempt: BridgeAttempt, stepName: LifecycleStepName): BridgeAttempt {
  const patch: StepPatch = { name: stepName, state: 'unknown-checking', sanitizedMessage: 'Transaction submitted — checking receipt' }
  return withDerived(patchStep(attempt, patch))
}

/** Apply an Iris attestation/forwarding poll result. */
export function applyPoll(attempt: BridgeAttempt, poll: AttestationPollResult): BridgeAttempt {
  let next = attempt
  switch (poll.status) {
    case 'pending':
    case 'attestation-pending':
      next = patchStep(next, { name: 'attestation', state: 'waiting', sanitizedMessage: 'Waiting for Circle to observe the burn' })
      break
    case 'attestation-available':
      next = patchStep(next, { name: 'attestation', state: 'success', completedAt: Date.now(), sanitizedMessage: 'Circle attestation available' })
      break
    case 'forwarding-queued':
      next = patchStep(next, { name: 'forwarded-mint', state: 'waiting', sanitizedMessage: 'Forwarding Service queued' })
      break
    case 'forwarding-pending':
      next = patchStep(next, { name: 'forwarded-mint', state: 'submitted', sanitizedMessage: 'Forwarding Service pending' })
      break
    case 'complete':
      if (poll.forwardTxHash) {
        next = patchStep(next, { name: 'forwarded-mint', txHash: poll.forwardTxHash, state: 'success', completedAt: Date.now(), forwarded: true, explorerUrl: `https://testnet.arcscan.app/tx/${poll.forwardTxHash}` })
      } else {
        next = patchStep(next, { name: 'forwarded-mint', state: 'success', completedAt: Date.now(), forwarded: true })
      }
      break
    case 'error':
      next = patchStep(next, { name: 'attestation', state: 'retryable-error', sanitizedMessage: 'Attestation temporarily unavailable' })
      break
  }
  return withDerived(next)
}

/** Apply an SDK-classified retryable error for a step. */
export function applyRetryableError(attempt: BridgeAttempt, stepName: LifecycleStepName, message: string): BridgeAttempt {
  const patch: StepPatch = { name: stepName, state: 'retryable-error', sanitizedMessage: message, retryable: true }
  return withDerived(patchStep(attempt, patch))
}

/** Apply an SDK-classified terminal error for a step. */
export function applyTerminalError(attempt: BridgeAttempt, stepName: LifecycleStepName, message: string): BridgeAttempt {
  const patch: StepPatch = { name: stepName, state: 'terminal-error', sanitizedMessage: message, retryable: false }
  return withDerived(patchStep(attempt, patch))
}

/** Resume after a verified successful burn: jump straight to attestation watching. */
export function resumeAfterBurn(attempt: BridgeAttempt): BridgeAttempt {
  let next = patchStep(attempt, { name: 'burn', state: 'success', receiptStatus: 'success', confirmedAt: Date.now() })
  next = patchStep(next, { name: 'attestation', state: 'waiting', sanitizedMessage: 'Resuming attestation polling' })
  return withDerived(next)
}
