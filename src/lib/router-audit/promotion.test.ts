import { describe, expect, it } from 'vitest'
import {
  allPromotionFacts,
  assertTargetConsistency,
  evaluateExecutablePromotion,
  executableTargetsFor,
  fixturePromotionFacts,
} from './promotion'

const target = '0x1111111111111111111111111111111111111111' as const
const candidates = { allowanceTarget: target, executionTarget: target, label: 'candidate-only-not-approved-for-execution' as const }

describe('strict verified-executable promotion gate', () => {
  it('promotes only when every mandatory requirement is definitively true', () => {
    const result = evaluateExecutablePromotion(allPromotionFacts(true))
    expect(result.eligible).toBe(true)
    expect(result.failedRequirements).toEqual([])
    expect(executableTargetsFor(result, candidates)).toEqual({ allowanceTarget: target, executionTarget: target })
  })

  it.each(['unknown', false, 'unsupported', 'skipped'] as const)('blocks one unresolved proxy requirement: %s', (value) => {
    const result = evaluateExecutablePromotion({ ...allPromotionFacts(true), 'definitive-proxy-status': value })
    expect(result.eligible).toBe(false)
    expect(result.failedRequirements).toEqual([{ requirement: 'definitive-proxy-status', result: value }])
    expect(executableTargetsFor(result, candidates)).toBeUndefined()
  })

  it('never lets offline fixtures promote a live provider', () => {
    const result = evaluateExecutablePromotion(fixturePromotionFacts())
    expect(result.eligible).toBe(false)
    expect(result.failedRequirements).toContainEqual({ requirement: 'live-mode', result: false })
  })

  it('rejects executable targets or calldata on all non-executable statuses', () => {
    for (const status of ['verified-quote-only', 'unverified', 'unavailable', 'disabled']) {
      expect(() => assertTargetConsistency({ status, executableTargets: { allowanceTarget: target, executionTarget: target } })).toThrow()
      expect(() => assertTargetConsistency({ status, approvalCalldata: '0x01' })).toThrow()
      expect(() => assertTargetConsistency({ status, transactionCalldata: '0x02' })).toThrow()
    }
  })
})
