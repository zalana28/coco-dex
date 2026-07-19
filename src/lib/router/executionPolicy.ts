/**
 * Operator-approved execution policy for Arc Testnet external routing.
 *
 * This module is separate from the strict router audit. The audit reports
 * whether a provider is independently verified; the execution policy decides
 * whether the UI may offer an executable route on Arc Testnet under
 * owner-approved conditions.
 *
 * Key invariant: `operator-approved-executable` NEVER implies `verified-executable`.
 * It is valid only on chain ID 5042002 (Arc Testnet) and requires fresh quote
 * + exact simulation before every transaction.
 */

import { arcTestnet } from '@/config/chains'

const ARC_CHAIN_ID = arcTestnet.id

/** Audit status from the strict router audit — never overwritten here. */
export type AuditStatus = 'verified-executable' | 'verified-quote-only' | 'unverified' | 'unavailable' | 'disabled'

/** Execution policy controlling whether the UI may execute swaps. */
export type ExecutionPolicy =
  | 'verified-executable'
  | 'operator-approved-executable'
  | 'operator-approved-pending-addresses'
  | 'verified-quote-only'
  | 'unverified'
  | 'unavailable'
  | 'disabled'

/** Provider identifier. */
export type ExternalProviderId = 'coco' | 'xylonet' | 'unitflow' | 'synthra'

/** Static provider execution descriptor. */
export type ProviderExecutionDescriptor = {
  provider: ExternalProviderId
  auditStatus: AuditStatus
  executionPolicy: ExecutionPolicy
  environment: 'arc-testnet'
  approvedBy: 'Coco DEX owner'
  approvedAt: string
  riskDisclosure: string
  pinnedAllowanceTarget?: `0x${string}`
  pinnedExecutionTarget?: `0x${string}`
  featureFlag: string
  killSwitch: boolean
}

const RISK_DISCLOSURE =
  'Third-party Arc Testnet route. Enabled by Coco DEX owner approval. This route has not passed Coco DEX\u2019s strict independent verification gate.'

const APPROVED_AT = '2026-07-19'

/** Feature flag env var names (public booleans, not secrets). */
export const FEATURE_FLAGS: Record<ExternalProviderId, string> = {
  coco: '',
  xylonet: 'VITE_ENABLE_XYLONET_EXECUTION',
  unitflow: 'VITE_ENABLE_UNITFLOW_EXECUTION',
  synthra: 'VITE_ENABLE_SYNTHRA_EXECUTION',
}

function readFlag(name: string): boolean {
  const val = import.meta.env[name]
  if (typeof val === 'string') return val === 'true' || val === '1'
  if (typeof val === 'boolean') return val
  return false
}

/** Registry-level kill switch per provider (session runtime). */
const killSwitches: Record<ExternalProviderId, boolean> = {
  coco: false,
  xylonet: false,
  unitflow: false,
  synthra: false,
}

export function setKillSwitch(provider: ExternalProviderId, disabled: boolean): void {
  killSwitches[provider] = disabled
}

export function isKillSwitchOn(provider: ExternalProviderId): boolean {
  return killSwitches[provider]
}

/**
 * Returns the effective execution policy for a provider given chain ID and
 * feature flag state. Returns 'disabled' when the kill switch is on, when
 * chain ID is not Arc Testnet, or when the feature flag is off.
 */
export function getEffectiveExecutionPolicy(
  provider: ExternalProviderId,
  chainId: number,
  config: Partial<Record<ExternalProviderId, ExecutionPolicy>> = {},
): ExecutionPolicy {
  if (killSwitches[provider]) return 'disabled'
  if (chainId !== ARC_CHAIN_ID) return 'disabled'

  const flagName = FEATURE_FLAGS[provider]
  if (flagName && !readFlag(flagName)) return 'disabled'

  return config[provider] ?? 'disabled'
}

/**
 * Returns true only when the execution policy allows execution on Arc Testnet.
 */
export function isExecutionAllowed(
  policy: ExecutionPolicy,
  chainId: number,
): boolean {
  if (chainId !== ARC_CHAIN_ID) return false
  return policy === 'operator-approved-executable' || policy === 'verified-executable'
}

/**
 * Returns true when the policy is operator-approved but addresses are not yet pinned.
 */
export function isPendingAddresses(policy: ExecutionPolicy): boolean {
  return policy === 'operator-approved-pending-addresses'
}

/**
 * Descriptor for Coco. Coco's audit status is 'unverified' (zero reserves).
 * Coco execution is governed by its own verified-executable gate, not the
 * operator-approved policy. Here we report the audit status only.
 */
export const COCO_DESCRIPTOR: ProviderExecutionDescriptor = {
  provider: 'coco',
  auditStatus: 'unverified',
  executionPolicy: 'verified-executable',
  environment: 'arc-testnet',
  approvedBy: 'Coco DEX owner',
  approvedAt: APPROVED_AT,
  riskDisclosure: 'Coco native route. Execution gated by the strict verified-executable promotion gate.',
  featureFlag: '',
  killSwitch: false,
}

/**
 * Descriptors for external providers. Each starts as operator-approved-executable
 * when its feature flag is on and addresses are pinned. Synthra starts as
 * pending-addresses until the owner supplies exact pinned addresses.
 */
export function buildProviderDescriptors(chainId: number): Record<ExternalProviderId, ProviderExecutionDescriptor> {
  const xylonetPolicy = getEffectiveExecutionPolicy('xylonet', chainId, {
    xylonet: 'operator-approved-executable',
  })
  const unitflowPolicy = getEffectiveExecutionPolicy('unitflow', chainId, {
    unitflow: 'operator-approved-executable',
  })
  const synthraPolicy = getEffectiveExecutionPolicy('synthra', chainId, {
    synthra: 'operator-approved-pending-addresses',
  })

  return {
    coco: COCO_DESCRIPTOR,
    xylonet: {
      provider: 'xylonet',
      auditStatus: 'unverified',
      executionPolicy: xylonetPolicy,
      environment: 'arc-testnet',
      approvedBy: 'Coco DEX owner',
      approvedAt: APPROVED_AT,
      riskDisclosure: RISK_DISCLOSURE,
      pinnedAllowanceTarget: '0x73742278c31a76dBb0D2587d03ef92E6E2141023',
      pinnedExecutionTarget: '0x73742278c31a76dBb0D2587d03ef92E6E2141023',
      featureFlag: FEATURE_FLAGS.xylonet,
      killSwitch: killSwitches.xylonet,
    },
    unitflow: {
      provider: 'unitflow',
      auditStatus: 'disabled',
      executionPolicy: unitflowPolicy,
      environment: 'arc-testnet',
      approvedBy: 'Coco DEX owner',
      approvedAt: APPROVED_AT,
      riskDisclosure: RISK_DISCLOSURE,
      pinnedAllowanceTarget: '0x4AA8c7Ac458479d9A4FA5c1481e03061ac76824A',
      pinnedExecutionTarget: '0x4AA8c7Ac458479d9A4FA5c1481e03061ac76824A',
      featureFlag: FEATURE_FLAGS.unitflow,
      killSwitch: killSwitches.unitflow,
    },
    synthra: {
      provider: 'synthra',
      auditStatus: 'unverified',
      executionPolicy: synthraPolicy,
      environment: 'arc-testnet',
      approvedBy: 'Coco DEX owner',
      approvedAt: APPROVED_AT,
      riskDisclosure: RISK_DISCLOSURE,
      pinnedAllowanceTarget: undefined,
      pinnedExecutionTarget: undefined,
      featureFlag: FEATURE_FLAGS.synthra,
      killSwitch: killSwitches.synthra,
    },
  }
}

/** Allowlisted function selectors for each provider. */
export const SELECTOR_ALLOWLIST: Record<ExternalProviderId, readonly `0x${string}`[]> = {
  coco: ['0x38ed1739'], // swapExactTokensForTokens
  xylonet: ['0x38ed1739'], // swapExactTokensForTokens
  unitflow: ['0x38ed1739'], // swapExactTokensForTokens
  synthra: ['0x414bf389'], // exactInputSingle
} as const

export function isSelectorAllowed(provider: ExternalProviderId, selector: `0x${string}`): boolean {
  return SELECTOR_ALLOWLIST[provider].includes(selector.toLowerCase() as `0x${string}`)
}

/**
 * Validate that a target address matches the pinned allowance/execution target.
 */
export function validatePinnedTarget(
  provider: ExternalProviderId,
  target: `0x${string}`,
  descriptors: Record<ExternalProviderId, ProviderExecutionDescriptor>,
): boolean {
  const desc = descriptors[provider]
  if (!desc) return false
  const lower = target.toLowerCase() as `0x${string}`
  return (
    desc.pinnedAllowanceTarget?.toLowerCase() === lower ||
    desc.pinnedExecutionTarget?.toLowerCase() === lower
  )
}

/**
 * Disclosure text for the confirmation dialog and provider cards.
 */
export const DISCLOSURE_TEXT = RISK_DISCLOSURE

/**
 * LocalStorage key for per-provider first-use acknowledgement.
 */
export const ACK_KEY_PREFIX = 'coco-dex:operator-approved-ack:'

export function hasAcknowledgedRisk(provider: ExternalProviderId): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(ACK_KEY_PREFIX + provider) !== null
  } catch {
    return false
  }
}

export function acknowledgeRisk(provider: ExternalProviderId): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ACK_KEY_PREFIX + provider, new Date().toISOString())
    }
  } catch {
    // localStorage unavailable (SSR / privacy mode) — non-blocking
  }
}

export function clearAcknowledgement(provider: ExternalProviderId): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(ACK_KEY_PREFIX + provider)
    }
  } catch {
    // non-blocking
  }
}
