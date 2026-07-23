import { ArcTestnet, BaseSepolia, EthereumSepolia, type BridgeResult } from '@circle-fin/bridge-kit'
import { z } from 'zod'
import { normalizeUsdc } from './amounts'
import { normalizeBridgeResult } from './result'
import type { SourceChain } from './chains'
import type { BridgeAttempt, LifecycleStep, LifecycleStepName } from './attempt'

export const BRIDGE_RECOVERY_KEY = 'coco:cctp-v2:recovery'
export const BRIDGE_ATTEMPTS_KEY = 'coco:cctp-v2:attempts'
export const RECOVERY_SCHEMA_VERSION = 2 as const
export const RECOVERY_SDK_VERSION = '@circle-fin/bridge-kit@1.12.1' as const
export const RECOVERY_PROTOCOL_VERSION = 'CCTPV2' as const

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/)
const hashSchema = z.string().regex(/^0x[a-fA-F0-9]+$/)
const jsonValueSchema: z.ZodType<unknown> = z.lazy(() => z.union([
  z.string(), z.number().finite(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(jsonValueSchema),
]))
const sdkStepSchema = z.object({
  name: z.string().min(1).max(64),
  state: z.enum(['pending', 'success', 'error', 'noop']),
  txHash: hashSchema.optional(),
  explorerUrl: z.string().url().optional(),
  data: jsonValueSchema.optional(),
  forwarded: z.boolean().optional(),
  batched: z.boolean().optional(),
  batchId: z.string().max(256).optional(),
  errorMessage: z.string().max(500).optional(),
  errorCategory: z.enum(['user_rejected', 'atomic_unsupported', 'batch_too_large', 'duplicate_batch_id', 'unknown_bundle', 'polling_timeout', 'failed_offchain', 'reverted_onchain', 'partial_reverted', 'chain_revert', 'unknown']).optional(),
}).strict()
const sdkResultSchema = z.object({
  amount: z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/),
  token: z.literal('USDC'),
  state: z.enum(['pending', 'success', 'error']),
  provider: z.literal('CCTPV2BridgingProvider'),
  sourceAddress: addressSchema,
  destinationAddress: addressSchema,
  recipientAddress: addressSchema,
  useForwarder: z.literal(true),
  transferSpeed: z.enum(['FAST', 'SLOW']),
  steps: z.array(sdkStepSchema).min(1).max(12),
}).strict()
const uiStateSchema = z.enum(['idle', 'waiting-wallet', 'pending', 'success', 'error', 'recoverable'])
const uiStepSchema = z.object({
  name: z.enum(['approve', 'burn', 'fetchAttestation', 'mint']),
  state: uiStateSchema,
  txHash: hashSchema.optional(),
  explorerUrl: z.string().url().optional(),
  error: z.string().max(500).optional(),
}).strict()

export const BridgeRecoverySchema = z.object({
  schemaVersion: z.literal(RECOVERY_SCHEMA_VERSION),
  sdkVersion: z.literal(RECOVERY_SDK_VERSION),
  protocolVersion: z.literal(RECOVERY_PROTOCOL_VERSION),
  traceId: z.string().regex(/^[a-fA-F0-9]{32}$/).optional(),
  wallet: addressSchema,
  source: z.enum(['Ethereum_Sepolia', 'Base_Sepolia']),
  destination: z.literal('Arc_Testnet'),
  recipient: addressSchema,
  amount: z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/),
  mode: z.enum(['FAST', 'SLOW']),
  steps: z.array(uiStepSchema).length(4),
  sdkResult: sdkResultSchema,
  burnHash: hashSchema,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
}).strict()
export type BridgeRecoveryRecord = z.infer<typeof BridgeRecoverySchema>

export interface RecoveryInput {
  wallet: string
  source: SourceChain
  recipient: string
  amount: string
  mode: 'FAST' | 'SLOW'
  result: BridgeResult
  traceId?: string
  now?: number
}

function toSdkSnapshot(result: BridgeResult, mode: 'FAST' | 'SLOW') {
  return {
    amount: normalizeUsdc(result.amount), token: 'USDC' as const, state: result.state,
    provider: 'CCTPV2BridgingProvider' as const,
    sourceAddress: result.source.address,
    destinationAddress: result.destination.address,
    recipientAddress: result.destination.recipientAddress ?? result.destination.address,
    useForwarder: true as const,
    transferSpeed: mode,
    steps: result.steps.map((step) => ({
      name: step.name,
      state: step.state,
      ...(step.txHash ? { txHash: step.txHash } : {}),
      ...(step.explorerUrl ? { explorerUrl: step.explorerUrl } : {}),
      ...(step.data !== undefined ? { data: step.data } : {}),
      ...(step.forwarded !== undefined ? { forwarded: step.forwarded } : {}),
      ...(step.batched !== undefined ? { batched: step.batched } : {}),
      ...(step.batchId ? { batchId: step.batchId } : {}),
      ...(step.errorMessage ? { errorMessage: step.errorMessage } : {}),
      ...(step.errorCategory ? { errorCategory: step.errorCategory } : {}),
    })),
  }
}

export function createRecoveryRecord(input: RecoveryInput): BridgeRecoveryRecord {
  const normalized = normalizeBridgeResult(input.result)
  if (!normalized.burnHash) throw new Error('Recovery can only be persisted after a successful burn')
  const now = input.now ?? Date.now()
  return BridgeRecoverySchema.parse({
    schemaVersion: RECOVERY_SCHEMA_VERSION,
    sdkVersion: RECOVERY_SDK_VERSION,
    protocolVersion: RECOVERY_PROTOCOL_VERSION,
    ...(input.traceId ? { traceId: input.traceId } : {}),
    wallet: input.wallet,
    source: input.source,
    destination: 'Arc_Testnet',
    recipient: input.recipient,
    amount: normalizeUsdc(input.amount),
    mode: input.mode,
    steps: normalized.steps,
    sdkResult: toSdkSnapshot(input.result, input.mode),
    burnHash: normalized.burnHash,
    createdAt: now,
    updatedAt: now,
  })
}

export function recoveryToBridgeResult(record: BridgeRecoveryRecord): BridgeResult {
  const sourceChain = record.source === 'Ethereum_Sepolia' ? EthereumSepolia : BaseSepolia
  const snapshot = record.sdkResult
  return {
    amount: snapshot.amount,
    token: 'USDC',
    state: snapshot.state,
    provider: snapshot.provider,
    config: { transferSpeed: snapshot.transferSpeed, batchTransactions: false },
    source: { address: snapshot.sourceAddress, chain: sourceChain },
    destination: {
      address: snapshot.destinationAddress,
      chain: ArcTestnet,
      recipientAddress: snapshot.recipientAddress,
      useForwarder: true,
    },
    steps: snapshot.steps as BridgeResult['steps'],
  }
}

export interface RecoveryBindings { wallet: string; source: SourceChain; recipient: string }
export function assertRecoveryBindings(record: BridgeRecoveryRecord, bindings: RecoveryBindings): void {
  const matches = record.wallet.toLowerCase() === bindings.wallet.toLowerCase()
    && record.source === bindings.source
    && record.destination === 'Arc_Testnet'
    && record.recipient.toLowerCase() === bindings.recipient.toLowerCase()
    && record.protocolVersion === 'CCTPV2'
    && record.sdkResult.sourceAddress.toLowerCase() === bindings.wallet.toLowerCase()
    && record.sdkResult.recipientAddress.toLowerCase() === bindings.recipient.toLowerCase()
    && record.sdkResult.useForwarder
  if (!matches) throw new Error('Recovery record does not match the active bridge session')
}

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function recoveryStore(storage: StorageLike) {
  return {
    load(): BridgeRecoveryRecord | null {
      const raw = storage.getItem(BRIDGE_RECOVERY_KEY)
      if (!raw) return null
      try { return BridgeRecoverySchema.parse(JSON.parse(raw)) }
      catch { storage.removeItem(BRIDGE_RECOVERY_KEY); return null }
    },
    saveAfterBurn(record: BridgeRecoveryRecord): void {
      const parsed = BridgeRecoverySchema.parse(record)
      const burn = parsed.sdkResult.steps.find((step) => step.name.replace(/[\s_-]/g, '').toLowerCase() === 'burn')
      if (!burn || burn.state !== 'success' || burn.txHash !== parsed.burnHash) throw new Error('Burn has not succeeded')
      storage.setItem(BRIDGE_RECOVERY_KEY, JSON.stringify(parsed))
    },
    clear(): void { storage.removeItem(BRIDGE_RECOVERY_KEY) },
  }
}

export function memoryStorage(): StorageLike {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: (key) => { values.delete(key) },
  }
}

export function browserRecoveryStore() {
  if (typeof localStorage === 'undefined') throw new Error('localStorage is unavailable')
  return recoveryStore(localStorage)
}

// ---------------------------------------------------------------------------
// Multi-attempt persistent store (versioned, with migration + history)
// ---------------------------------------------------------------------------

export interface StoredAttempts {
  schemaVersion: number
  attempts: BridgeAttempt[]
}

const HISTORY_LIMIT = 5

function sanitizeAttempt(attempt: BridgeAttempt): BridgeAttempt {
  // Never persist non-serializable or sensitive objects.
  return JSON.parse(JSON.stringify(attempt)) as BridgeAttempt
}

function migrate(raw: unknown): StoredAttempts {
  if (!raw || typeof raw !== 'object') return { schemaVersion: RECOVERY_SCHEMA_VERSION, attempts: [] }
  const record = raw as Record<string, unknown>
  // v1 single-record shape → wrap into v2 attempts list (best-effort).
  if (record.schemaVersion === 1 && record.sdkResult) {
    try {
      const legacy = BridgeRecoverySchema.parse(record)
      return { schemaVersion: RECOVERY_SCHEMA_VERSION, attempts: [legacyToAttempt(legacy)] }
    } catch {
      // Defensive: a v1 record that no longer matches the strict schema still
      // migrates via a structural (best-effort) conversion so recovery history
      // is never silently dropped.
      const loose = looseLegacyToAttempt(record)
      if (loose) return { schemaVersion: RECOVERY_SCHEMA_VERSION, attempts: [loose] }
      return { schemaVersion: RECOVERY_SCHEMA_VERSION, attempts: [] }
    }
  }
  if (Array.isArray(record.attempts)) {
    const attempts = (record.attempts as unknown[]).filter((item): item is BridgeAttempt => typeof item === 'object' && item !== null && 'id' in item)
    return { schemaVersion: RECOVERY_SCHEMA_VERSION, attempts }
  }
  return { schemaVersion: RECOVERY_SCHEMA_VERSION, attempts: [] }
}

/** Best-effort structural conversion of a legacy v1 record when strict parse fails. */
function looseLegacyToAttempt(record: Record<string, unknown>): BridgeAttempt | null {
  const sdk = (record.sdkResult ?? {}) as Record<string, unknown>
  const stepsRaw = (sdk.steps ?? []) as Array<Record<string, unknown>>
  const map: Record<string, string> = { approve: 'approve', burn: 'burn', fetchAttestation: 'attestation', mint: 'forwarded-mint' }
  const steps = Object.fromEntries(
    Object.entries(map).map(([sdkName, canonical]) => {
      const s = stepsRaw.find((x) => x.name === sdkName)
      const base: LifecycleStep = {
        name: canonical as LifecycleStepName,
        state: s?.state === 'success' ? 'success' : s?.state === 'error' ? 'retryable-error' : 'not-started',
      }
      if (s && typeof s.txHash === 'string') base.txHash = s.txHash
      if (s && typeof s.explorerUrl === 'string') base.explorerUrl = s.explorerUrl
      return [canonical, base]
    }),
  ) as Record<LifecycleStepName, LifecycleStep>
  const source = record.source === 'Base_Sepolia' ? 'Base_Sepolia' : 'Ethereum_Sepolia'
  return {
    id: typeof record.burnHash === 'string' ? `migrated_${record.burnHash.slice(0, 10)}` : `migrated_${Date.now()}`,
    ...(typeof record.traceId === 'string' ? { traceId: record.traceId } : {}),
    createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now(),
    updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : Date.now(),
    account: typeof record.wallet === 'string' ? record.wallet : '0x0',
    sourceChain: source,
    sourceChainId: source === 'Ethereum_Sepolia' ? 11155111 : 84532,
    sourceDomain: source === 'Ethereum_Sepolia' ? 0 : 6,
    destinationChain: 'Arc_Testnet',
    destinationChainId: 5042002,
    destinationDomain: 26,
    token: 'USDC',
    amount: typeof record.amount === 'string' ? record.amount : '0',
    recipient: typeof record.recipient === 'string' ? record.recipient : (typeof sdk.recipientAddress === 'string' ? sdk.recipientAddress : '0x0'),
    transferSpeed: record.mode === 'FAST' ? 'FAST' : 'SLOW',
    useForwarder: true,
    overallState: sdk.state === 'success' ? 'complete' : 'unknown-checking',
    steps,
    bridgeResult: sdk,
  }
}

function legacyToAttempt(legacy: BridgeRecoveryRecord): BridgeAttempt {
  const steps = Object.fromEntries(
    (['approve', 'burn', 'fetchAttestation', 'mint'] as const).map((name) => {
      const canonical = name === 'fetchAttestation' ? 'attestation' : name === 'mint' ? 'forwarded-mint' : name
      const sdk = legacy.sdkResult.steps.find((s) => s.name === name)
      return [canonical, {
        name: canonical,
        state: sdk ? (sdk.state === 'success' ? 'success' : sdk.state === 'error' ? 'retryable-error' : 'not-started') : 'not-started',
        ...(sdk?.txHash ? { txHash: sdk.txHash } : {}),
        ...(sdk?.explorerUrl ? { explorerUrl: sdk.explorerUrl } : {}),
      } as LifecycleStep]
    }),
  ) as Record<LifecycleStepName, LifecycleStep>
  return {
    id: `migrated_${legacy.burnHash.slice(0, 10)}`,
    ...(legacy.traceId ? { traceId: legacy.traceId } : {}),
    createdAt: legacy.createdAt,
    updatedAt: legacy.updatedAt,
    account: legacy.wallet,
    sourceChain: legacy.source,
    sourceChainId: legacy.source === 'Ethereum_Sepolia' ? 11155111 : 84532,
    sourceDomain: legacy.source === 'Ethereum_Sepolia' ? 0 : 6,
    destinationChain: 'Arc_Testnet',
    destinationChainId: 5042002,
    destinationDomain: 26,
    token: 'USDC',
    amount: legacy.amount,
    recipient: legacy.recipient,
    transferSpeed: legacy.mode,
    useForwarder: true,
    overallState: legacy.sdkResult.state === 'success' ? 'complete' : 'unknown-checking',
    steps,
    bridgeResult: legacy.sdkResult,
  }
}

export interface AttemptStore {
  loadAll(): BridgeAttempt[]
  save(attempt: BridgeAttempt): void
  upsert(attempt: BridgeAttempt): void
  remove(id: string): void
  clear(): void
}

export function attemptStore(storage: StorageLike): AttemptStore {
  return {
    loadAll(): BridgeAttempt[] {
      const raw = storage.getItem(BRIDGE_ATTEMPTS_KEY)
      if (!raw) return []
      try {
        const parsed = migrate(JSON.parse(raw))
        storage.setItem(BRIDGE_ATTEMPTS_KEY, JSON.stringify(parsed))
        return parsed.attempts
      } catch {
        storage.removeItem(BRIDGE_ATTEMPTS_KEY)
        return []
      }
    },
    save(attempt: BridgeAttempt): void {
      const all = this.loadAll()
      const safe = sanitizeAttempt(attempt)
      const idx = all.findIndex((a) => a.id === safe.id)
      if (idx >= 0) all[idx] = safe
      else all.push(safe)
      const trimmed = all.slice(-HISTORY_LIMIT * 2)
      storage.setItem(BRIDGE_ATTEMPTS_KEY, JSON.stringify({ schemaVersion: RECOVERY_SCHEMA_VERSION, attempts: trimmed } satisfies StoredAttempts))
    },
    upsert(attempt: BridgeAttempt): void {
      this.save(attempt)
    },
    remove(id: string): void {
      const all = this.loadAll().filter((a) => a.id !== id)
      storage.setItem(BRIDGE_ATTEMPTS_KEY, JSON.stringify({ schemaVersion: RECOVERY_SCHEMA_VERSION, attempts: all } satisfies StoredAttempts))
    },
    clear(): void {
      storage.removeItem(BRIDGE_ATTEMPTS_KEY)
    },
  }
}

export function browserAttemptStore(): AttemptStore {
  if (typeof localStorage === 'undefined') throw new Error('localStorage is unavailable')
  return attemptStore(localStorage)
}
