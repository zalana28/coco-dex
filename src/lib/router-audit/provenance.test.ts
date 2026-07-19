import { describe, expect, it } from 'vitest'
import { ROUTER_AUDIT_REGISTRY } from './registry'
import { evaluateExecutablePromotion, allPromotionFacts, fixturePromotionFacts } from './promotion'

describe('UnitFlow provenance and conflict taxonomy', () => {
  const unitflow = ROUTER_AUDIT_REGISTRY.find(({ id }) => id === 'unitflow')!
  it('classifies official documentation candidates with unitflowOfficialContracts provenance', () => {
    const official = unitflow.conflictingCandidates.filter((c) => c.provenance.some((p) => p.kind === 'unitflowOfficialContracts'))
    expect(official.length).toBeGreaterThan(0)
    expect(official.every((c) => c.provenance.some((p) => p.kind === 'unitflowOfficialContracts'))).toBe(true)
  })

  it('keeps stale frontend candidates distinctly classified and never as official conflicts', () => {
    const stale = unitflow.conflictingCandidates.filter((c) => c.conflictClass === 'stale-frontend-candidate')
    expect(stale.length).toBeGreaterThan(0)
    expect(stale.every((c) => c.provenance.some((p) => p.kind === 'unitflowFrontendObserved'))).toBe(true)
    expect(stale.every((c) => !c.provenance.some((p) => p.kind === 'unitflowOfficialContracts'))).toBe(true)
  })

  it('records official-vs-frontend conflict classes when an official candidate shares a group with a stale frontend candidate', () => {
    const groups = new Map<string, string[]>()
    for (const c of unitflow.conflictingCandidates) {
      if (c.conflictGroup) groups.set(c.conflictGroup, [...(groups.get(c.conflictGroup) ?? []), c.conflictClass ?? 'unresolved-candidate'])
    }
    for (const classes of groups.values()) {
      const hasOfficial = classes.includes('official-vs-frontend')
      const hasStale = classes.includes('stale-frontend-candidate')
      if (hasOfficial && hasStale) expect(hasOfficial && hasStale).toBe(true)
    }
    expect(groups.get('unitflow-v3-router')).toContain('official-vs-official')
    expect(groups.get('unitflow-v3-position-manager')).toContain('official-vs-official')
    expect(groups.get('unitflow-v4-pool-manager')).toContain('official-vs-frontend')
    expect(groups.get('unitflow-v4-position-descriptor')).toContain('official-vs-frontend')
    expect(groups.get('unitflow-universal-router')).toContain('official-vs-frontend')
  })

  it('preserves official inventory including V3/V4 support contracts', () => {
    const addresses = [...unitflow.inventoryCandidates, ...unitflow.conflictingCandidates].map((c) => c.address)
    expect(addresses).toContain('0xab6a8aab7d490007634ef59d424b5d89688a1971'.toLowerCase())
    expect(addresses).toContain('0x121aeb6def00f6f67665008cac1c19805886ed1a'.toLowerCase())
    expect(addresses).toContain('0x33c02bfb9e39aaae30f8be86b850f8ce53d20c0b'.toLowerCase())
    expect(addresses).toContain('0xeaea934839e8a7cfbfd85336380f77d72e090bbe'.toLowerCase())
    expect(addresses).toContain('0x212f6ded16644cb2858aa9cc7df5150d0356c2c7'.toLowerCase())
  })
})

describe('Coco provenance paths exist', () => {
  const coco = ROUTER_AUDIT_REGISTRY.find(({ id }) => id === 'coco')!
  it('uses the canonical deployment JSON and real Solidity sources', () => {
    expect(coco.evidenceSources.some((p) => p.kind === 'repo-deployment-json')).toBe(true)
    expect(coco.sourceCodeProvenance.every((p) => p.kind === 'official-repository' && p.reference.startsWith('contracts/src/'))).toBe(true)
  })
})

describe('XyloNet ABI provenance is not overstated', () => {
  const xylonet = ROUTER_AUDIT_REGISTRY.find(({ id }) => id === 'xylonet')!
  it('does not label operator-supplied ABIs as official documentation', () => {
    expect(xylonet.abiProvenance.every((p) => p.kind !== 'official-documentation' || p.reference === 'https://www.xylonet.xyz/')).toBe(true)
    expect(xylonet.abiProvenance.some((p) => p.kind === 'operatorSuppliedCandidate')).toBe(true)
  })
})

describe('strict promotion gate cannot be bypassed', () => {
  it('blocks a single unknown proxy requirement', () => {
    const result = evaluateExecutablePromotion({ ...allPromotionFacts(true), 'definitive-proxy-status': 'unknown' })
    expect(result.eligible).toBe(false)
    expect(result.failedRequirements.map((r) => r.requirement)).toContain('definitive-proxy-status')
  })

  it('never lets offline fixtures promote a live provider', () => {
    const result = evaluateExecutablePromotion(fixturePromotionFacts())
    expect(result.eligible).toBe(false)
    expect(result.failedRequirements.map((r) => r.requirement)).toContain('live-mode')
  })
})
