import { ArcTestnet, BaseSepolia, EthereumSepolia, type BridgeResult } from '@circle-fin/bridge-kit'
import { z } from 'zod'
import { normalizeUsdc } from './amounts'
import { normalizeBridgeResult } from './result'
import type { SourceChain } from './chains'

export const BRIDGE_RECOVERY_KEY = 'coco:cctp-v2:recovery'
export const RECOVERY_SCHEMA_VERSION = 1 as const
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
