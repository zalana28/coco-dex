import type { ProviderStatus } from './types'

export type OfflineScenario = {
  id: string
  provider: 'coco' | 'xylonet' | 'unitflow' | 'synthra'
  expectedStatus: ProviderStatus
  facts: {
    bytecode: 'matched' | 'missing' | 'mismatch'
    proxy: 'none' | 'resolved-mutable' | 'unresolved'
    decimals: 'matched' | 'mismatch' | 'unknown'
    relationships: 'matched' | 'mismatch' | 'unknown'
    quote: 'valid' | 'zero' | 'malformed' | 'unavailable'
    executionSimulation: 'passed' | 'failed' | 'not-run'
    documentationConflict: boolean
    wrappingRequirement: 'none' | 'unresolved'
  }
  disableReason?: string
}

export const OFFLINE_AUDIT_CONTEXT = {
  fixtureOnly: true,
  chainId: 5_042_002,
  auditBlockNumber: 52_330_700,
  auditBlockHash: `0x${'ab'.repeat(32)}`,
  auditBlockTimestamp: 1_750_000_000,
  rpcProviderLabel: 'deterministic offline fixture',
  rpcCapabilityLimitations: ['No network access; fixture evidence is not live verification.'],
} as const

export const OFFLINE_SCENARIOS: readonly OfflineScenario[] = [
  {
    id: 'coco-complete-fixture', provider: 'coco', expectedStatus: 'verified-executable',
    facts: { bytecode: 'matched', proxy: 'none', decimals: 'matched', relationships: 'matched', quote: 'valid', executionSimulation: 'passed', documentationConflict: false, wrappingRequirement: 'none' },
  },
  {
    id: 'xylonet-quote-only-fixture', provider: 'xylonet', expectedStatus: 'verified-quote-only',
    facts: { bytecode: 'matched', proxy: 'resolved-mutable', decimals: 'matched', relationships: 'matched', quote: 'valid', executionSimulation: 'not-run', documentationConflict: false, wrappingRequirement: 'none' },
    disableReason: 'Fixture quote passed but execution requirements remain unresolved.',
  },
  {
    id: 'unitflow-conflict-fixture', provider: 'unitflow', expectedStatus: 'disabled',
    facts: { bytecode: 'mismatch', proxy: 'unresolved', decimals: 'unknown', relationships: 'unknown', quote: 'malformed', executionSimulation: 'not-run', documentationConflict: true, wrappingRequirement: 'unresolved' },
    disableReason: 'Conflicting documentation, unresolved proxy, WUSDC conversion, and UniversalRouter command risk.',
  },
  {
    id: 'synthra-unavailable-fixture', provider: 'synthra', expectedStatus: 'unavailable',
    facts: { bytecode: 'missing', proxy: 'unresolved', decimals: 'unknown', relationships: 'unknown', quote: 'unavailable', executionSimulation: 'not-run', documentationConflict: false, wrappingRequirement: 'none' },
    disableReason: 'No authoritative Arc deployment fixture is available.',
  },
  {
    id: 'decimal-mismatch-fixture', provider: 'xylonet', expectedStatus: 'disabled',
    facts: { bytecode: 'matched', proxy: 'none', decimals: 'mismatch', relationships: 'matched', quote: 'valid', executionSimulation: 'not-run', documentationConflict: false, wrappingRequirement: 'none' },
    disableReason: 'Token decimals mismatch.',
  },
  {
    id: 'code-hash-mismatch-fixture', provider: 'coco', expectedStatus: 'disabled',
    facts: { bytecode: 'mismatch', proxy: 'none', decimals: 'matched', relationships: 'matched', quote: 'valid', executionSimulation: 'not-run', documentationConflict: false, wrappingRequirement: 'none' },
    disableReason: 'Runtime code hash changed.',
  },
  {
    id: 'malformed-quote-fixture', provider: 'xylonet', expectedStatus: 'unverified',
    facts: { bytecode: 'matched', proxy: 'none', decimals: 'matched', relationships: 'matched', quote: 'malformed', executionSimulation: 'not-run', documentationConflict: false, wrappingRequirement: 'none' },
    disableReason: 'Malformed ABI quote response.',
  },
] as const

export function classifyScenario(scenario: OfflineScenario): ProviderStatus {
  const { facts } = scenario
  if (facts.bytecode === 'missing') return 'unavailable'
  if (facts.bytecode === 'mismatch' || facts.decimals === 'mismatch' || facts.relationships === 'mismatch' || facts.wrappingRequirement === 'unresolved') return 'disabled'
  if (facts.proxy === 'unresolved' || facts.quote === 'malformed' || facts.relationships === 'unknown') return 'unverified'
  if (facts.quote === 'valid' && facts.executionSimulation === 'passed' && facts.proxy === 'none') return 'verified-executable'
  if (facts.quote === 'valid') return 'verified-quote-only'
  return 'unverified'
}

export function evaluateOfflineScenarios() {
  return OFFLINE_SCENARIOS.map((scenario) => ({
    id: scenario.id,
    provider: scenario.provider,
    status: classifyScenario(scenario),
    expectedStatus: scenario.expectedStatus,
    passed: classifyScenario(scenario) === scenario.expectedStatus,
    fixtureOnly: true,
    disableReason: scenario.disableReason,
  }))
}
