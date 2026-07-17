import type { BridgeResult } from '@circle-fin/bridge-kit'
import { classifyBridgeError } from './errors'

export const BRIDGE_STEP_NAMES = ['approve', 'burn', 'fetchAttestation', 'mint'] as const
export type BridgeStepName = typeof BRIDGE_STEP_NAMES[number]
export type BridgeUiState = 'idle' | 'waiting-wallet' | 'pending' | 'success' | 'error' | 'recoverable'
type SdkStep = BridgeResult['steps'][number]

export interface NormalizedBridgeStep {
  name: BridgeStepName
  state: BridgeUiState
  txHash?: string
  explorerUrl?: string
  error?: string
}
export interface NormalizedBridgeResult {
  amount: string
  state: BridgeResult['state']
  provider: string
  steps: NormalizedBridgeStep[]
  burnHash?: string
}

function canonicalName(name: string): BridgeStepName | undefined {
  const compact = name.replace(/[\s_-]/g, '').toLowerCase()
  return BRIDGE_STEP_NAMES.find((item) => item.toLowerCase() === compact)
}

function isRecoverable(step: SdkStep): boolean {
  if (step.errorCategory === 'user_rejected' || step.errorCategory === 'chain_revert' || step.errorCategory === 'reverted_onchain' || step.errorCategory === 'partial_reverted') return false
  return classifyBridgeError(step.error ?? step.errorMessage ?? '').recoverable
}

export function normalizeBridgeResult(result: BridgeResult): NormalizedBridgeResult {
  const byName = new Map<BridgeStepName, SdkStep>()
  for (const step of result.steps) {
    const name = canonicalName(step.name)
    if (name) byName.set(name, step)
  }
  let nextPendingAssigned = false
  const steps = BRIDGE_STEP_NAMES.map((name): NormalizedBridgeStep => {
    const sdk = byName.get(name)
    if (!sdk) {
      const priorComplete = BRIDGE_STEP_NAMES.slice(0, BRIDGE_STEP_NAMES.indexOf(name)).every((prior) => byName.get(prior)?.state === 'success' || byName.get(prior)?.state === 'noop')
      if (!nextPendingAssigned && priorComplete && (name === 'approve' || name === 'burn')) {
        nextPendingAssigned = true
        return { name, state: 'waiting-wallet' }
      }
      return { name, state: 'idle' }
    }
    const state: BridgeUiState = sdk.state === 'noop' ? 'success' : sdk.state === 'error' ? (isRecoverable(sdk) ? 'recoverable' : 'error') : sdk.state
    return {
      name, state,
      ...(sdk.txHash ? { txHash: sdk.txHash } : {}),
      ...(sdk.explorerUrl ? { explorerUrl: sdk.explorerUrl } : {}),
      ...(sdk.errorMessage ? { error: classifyBridgeError(sdk.errorMessage).message } : {}),
    }
  })
  const burnHash = steps.find((step) => step.name === 'burn' && step.state === 'success')?.txHash
  return { amount: result.amount, state: result.state, provider: result.provider, steps, ...(burnHash ? { burnHash } : {}) }
}
