export const MANDATORY_PROMOTION_REQUIREMENTS = [
  'live-mode', 'arc-chain', 'valid-addresses', 'runtime-code', 'definitive-proxy-status',
  'proxy-hash-pinned', 'proxy-hash-matched', 'implementation-resolved',
  'implementation-hash-pinned', 'implementation-hash-matched', 'beacon-evidence-complete',
  'upgradeability-documented', 'authoritative-abi', 'authoritative-deployment',
  'official-conflicts-resolved', 'source-paths-exist', 'router-factory-relationship',
  'pool-factory-relationship', 'pool-token-membership', 'token-ordering',
  'token-decimals', 'allowance-target-verified', 'execution-target-verified',
  'bounded-quote-matrix-complete', 'quote-block-comparable', 'quote-outputs-valid',
  'reserve-bounds', 'quote-freshness', 'exact-calldata', 'recipient-explicit',
  'deadline-verified', 'min-output-verified', 'no-unexpected-value',
  'wrapping-resolved', 'simulation-passed', 'sender-assumptions-documented',
  'no-arbitrary-call', 'no-unknown-mandatory-fields', 'no-skipped-checks',
] as const

export type PromotionRequirement = (typeof MANDATORY_PROMOTION_REQUIREMENTS)[number]
export type PromotionFacts = Readonly<Record<PromotionRequirement, boolean | 'unknown' | 'unsupported' | 'skipped'>>

export type PromotionGateResult = Readonly<{
  eligible: boolean
  status: 'verified-executable' | 'non-executable'
  failedRequirements: readonly Readonly<{ requirement: PromotionRequirement; result: PromotionFacts[PromotionRequirement] }>[]
}>

export function evaluateExecutablePromotion(facts: PromotionFacts): PromotionGateResult {
  const failedRequirements = MANDATORY_PROMOTION_REQUIREMENTS
    .filter((requirement) => facts[requirement] !== true)
    .map((requirement) => Object.freeze({ requirement, result: facts[requirement] }))
  return Object.freeze({
    eligible: failedRequirements.length === 0,
    status: failedRequirements.length === 0 ? 'verified-executable' : 'non-executable',
    failedRequirements: Object.freeze(failedRequirements),
  })
}

export function allPromotionFacts(value: PromotionFacts[PromotionRequirement] = true): PromotionFacts {
  return Object.freeze(Object.fromEntries(MANDATORY_PROMOTION_REQUIREMENTS.map((key) => [key, value])) as unknown as PromotionFacts)
}

export function fixturePromotionFacts(): PromotionFacts {
  return Object.freeze({ ...allPromotionFacts(true), 'live-mode': false })
}

export type CandidateTargets = Readonly<{
  allowanceTarget?: `0x${string}`
  executionTarget?: `0x${string}`
  label: 'candidate-only-not-approved-for-execution'
}>

export type ExecutableTargets = Readonly<{
  allowanceTarget: `0x${string}`
  executionTarget: `0x${string}`
}>

export function executableTargetsFor(
  promotion: PromotionGateResult,
  candidates: CandidateTargets,
): ExecutableTargets | undefined {
  if (!promotion.eligible || !candidates.allowanceTarget || !candidates.executionTarget) return undefined
  return Object.freeze({ allowanceTarget: candidates.allowanceTarget, executionTarget: candidates.executionTarget })
}

export function assertTargetConsistency(input: {
  status: string
  executableTargets?: ExecutableTargets
  approvalCalldata?: string
  transactionCalldata?: string
}): void {
  if (input.status !== 'verified-executable' && input.executableTargets) throw new Error('non-executable provider must not expose executable targets')
  if (input.status !== 'verified-executable' && (input.approvalCalldata || input.transactionCalldata)) throw new Error('non-executable provider must not produce approval or transaction calldata')
}
