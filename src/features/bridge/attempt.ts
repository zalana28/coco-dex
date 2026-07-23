import type { BridgeResult } from '@circle-fin/bridge-kit'
import type { SourceChain } from './chains'
import { classifyBridgeError, type BridgeErrorCategory } from './errors'

/**
 * Canonical CCTP V2 Forwarding Service lifecycle steps, mapped by SEMANTIC NAME.
 * Never map by array position — SDK step order/omission/reordering is handled
 * by {@link normalizeBridgeSteps}.
 */
export const LIFECYCLE_STEP_NAMES = ['approve', 'burn', 'attestation', 'forwarded-mint'] as const
export type LifecycleStepName = (typeof LIFECYCLE_STEP_NAMES)[number]

/** Fine-grained per-step UI states. */
export type LifecycleStepState =
  | 'not-started'
  | 'awaiting-wallet'
  | 'submitted'
  | 'confirming'
  | 'waiting'
  | 'success'
  | 'retryable-error'
  | 'terminal-error'
  | 'unknown-checking'
  | 'noop'
  | 'skipped'

/** Overall attempt states. */
export type BridgeAttemptState =
  | 'draft'
  | 'awaiting-confirmation'
  | 'approving'
  | 'burning'
  | 'waiting-attestation'
  | 'forwarding'
  | 'minting'
  | 'complete'
  | 'retryable-error'
  | 'terminal-error'
  | 'unknown-checking'

/** Friendly labels for the four canonical steps. */
export const LIFECYCLE_STEP_LABELS: Record<LifecycleStepName, string> = {
  approve: 'Approve USDC',
  burn: 'Burn on source',
  attestation: 'Circle attestation',
  'forwarded-mint': 'Forwarded mint on Arc',
}

/** Aliases used by the installed SDK / Circle CCTP v2 step names. */
const STEP_ALIASES: Array<{ alias: RegExp; name: LifecycleStepName }> = [
  { alias: /^(approve|approval)$/i, name: 'approve' },
  { alias: /^(burn|depositforburn|deposit_for_burn|customburn|custom_burn|burnfor|burn_for)$/i, name: 'burn' },
  { alias: /^(attestation|fetchattestation|fetch_attestation|fetch-attestation|attest)$/i, name: 'attestation' },
  { alias: /^(forward|forwarding|receivemessage|receive_message|destinationmint|destination_mint)$/i, name: 'forwarded-mint' },
  { alias: /^(mint)$/i, name: 'forwarded-mint' },
]

/** Map an arbitrary SDK step name to a canonical lifecycle step name. */
export function canonicalStepName(name: string): LifecycleStepName | undefined {
  const compact = name.replace(/[\s_-]/g, '')
  return STEP_ALIASES.find((entry) => entry.alias.test(compact))?.name
}

export interface LifecycleStep {
  name: LifecycleStepName
  state: LifecycleStepState
  sdkName?: string
  txHash?: string
  explorerUrl?: string
  submittedAt?: number
  confirmedAt?: number
  completedAt?: number
  lastCheckedAt?: number
  errorCategory?: BridgeErrorCategory
  sanitizedMessage?: string
  retryable?: boolean
  forwarded?: boolean
  receiptStatus?: 'pending' | 'success' | 'reverted'
  chain?: SourceChain | 'Arc_Testnet'
  attemptNumber?: number
}

export interface BridgeAttempt {
  id: string
  traceId?: string
  createdAt: number
  updatedAt: number

  account: string
  sourceChain: SourceChain
  sourceChainId: number
  sourceDomain: number
  destinationChain: 'Arc_Testnet'
  destinationChainId: number
  destinationDomain: number

  token: 'USDC'
  amount: string
  recipient: string
  transferSpeed: 'SLOW' | 'FAST'
  useForwarder: boolean

  estimateSnapshot?: unknown
  overallState: BridgeAttemptState
  activeStep?: LifecycleStepName

  steps: Record<LifecycleStepName, LifecycleStep>
  bridgeResult?: unknown
  recoveryMetadata?: Record<string, unknown>
}

export interface BridgeAttemptInput {
  account: string
  source: SourceChain
  sourceChainId: number
  sourceDomain: number
  recipient: string
  amount: string
  transferSpeed: 'SLOW' | 'FAST'
  useForwarder: boolean
  traceId?: string
  estimateSnapshot?: unknown
}

let idCounter = 0
function makeId(prefix: string): string {
  idCounter += 1
  const rand = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 14)
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}_${rand}`
}

export function createBridgeAttempt(input: BridgeAttemptInput): BridgeAttempt {
  const now = Date.now()
  const steps = Object.fromEntries(
    LIFECYCLE_STEP_NAMES.map((name) => [name, { name, state: 'not-started' as LifecycleStepState }]),
  ) as Record<LifecycleStepName, LifecycleStep>
  return {
    id: makeId('attempt'),
    ...(input.traceId ? { traceId: input.traceId } : {}),
    createdAt: now,
    updatedAt: now,
    account: input.account,
    sourceChain: input.source,
    sourceChainId: input.sourceChainId,
    sourceDomain: input.sourceDomain,
    destinationChain: 'Arc_Testnet',
    destinationChainId: 5042002,
    destinationDomain: 26,
    token: 'USDC',
    amount: input.amount,
    recipient: input.recipient,
    transferSpeed: input.transferSpeed,
    useForwarder: input.useForwarder,
    ...(input.estimateSnapshot ? { estimateSnapshot: input.estimateSnapshot } : {}),
    overallState: 'draft',
    steps,
  }
}

/** Snapshot of an SDK BridgeResult, normalized into the lifecycle step map. */
export function normalizeBridgeSteps(result: BridgeResult): Record<LifecycleStepName, LifecycleStep> {
  const base = Object.fromEntries(
    LIFECYCLE_STEP_NAMES.map((name) => [name, { name, state: 'not-started' as LifecycleStepState }]),
  ) as Record<LifecycleStepName, LifecycleStep>

  for (const sdk of result.steps) {
    const name = canonicalStepName(sdk.name)
    if (!name) continue
    const existing = base[name]!
    const error = sdk.errorMessage ?? (sdk.state === 'error' ? 'Transaction failed' : undefined)
    const safe = error ? classifyBridgeError(error) : null
    base[name] = {
      ...existing,
      sdkName: sdk.name,
      state:
        sdk.state === 'noop'
          ? 'noop'
          : sdk.state === 'success'
            ? 'success'
            : sdk.state === 'pending'
              ? 'waiting'
              : (safe?.recoverable ? 'retryable-error' : 'terminal-error'),
      ...(sdk.txHash ? { txHash: sdk.txHash } : {}),
      ...(sdk.explorerUrl ? { explorerUrl: sdk.explorerUrl } : {}),
      ...(sdk.forwarded !== undefined ? { forwarded: sdk.forwarded } : {}),
      ...(error ? { sanitizedMessage: safe?.message, errorCategory: safe?.category, retryable: safe?.recoverable } : {}),
    }
  }
  return base
}

/** Reduce the overall attempt state from the step map + active step. */
export function deriveOverallState(steps: Record<LifecycleStepName, LifecycleStep>): { overall: BridgeAttemptState; active?: LifecycleStepName } {
  const order: LifecycleStepName[] = ['approve', 'burn', 'attestation', 'forwarded-mint']
  // Terminal / retryable errors take precedence regardless of position.
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
  // Find the first not-yet-success step (the active frontier).
  for (const name of order) {
    const st = steps[name]!.state
    if (st === 'success') continue
    const activeMap = { approve: 'approving', burn: 'burning', attestation: 'waiting-attestation', 'forwarded-mint': 'minting' } as const
    if (name === 'forwarded-mint' && st === 'submitted') return { overall: 'forwarding', active: name }
    return { overall: activeMap[name], active: name }
  }
  return { overall: 'complete' }
}
