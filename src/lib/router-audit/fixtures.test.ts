import { describe, expect, it, vi } from 'vitest'
import { evaluateOfflineScenarios, OFFLINE_SCENARIOS } from './fixtures'
import { buildOfflineReport, stableJson } from './report'

describe('deterministic offline router audit fixtures', () => {
  it('covers every provider and required transition fixture', () => {
    expect(new Set(OFFLINE_SCENARIOS.map(({ provider }) => provider))).toEqual(new Set(['coco', 'xylonet', 'unitflow', 'synthra']))
    expect(new Set(OFFLINE_SCENARIOS.map(({ expectedStatus }) => expectedStatus))).toEqual(
      new Set(['verified-executable', 'verified-quote-only', 'unverified', 'unavailable', 'disabled']),
    )
    expect(evaluateOfflineScenarios().every(({ passed }) => passed)).toBe(true)
  })

  it('does not make network requests', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    evaluateOfflineScenarios()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('produces deterministic stable JSON and a clearly fixture-only report', () => {
    const first = buildOfflineReport()
    const second = buildOfflineReport()
    expect(stableJson(first)).toBe(stableJson(second))
    expect(stableJson({ amount: 1n })).toBe('{\n  "amount": "1"\n}\n')
    expect(first.mode).toBe('offline-fixture')
    expect(first.fixture).toBe(true)
    expect(first.networkAccess).toBe(false)
    expect(first.noBroadcastStatement).toMatch(/never broadcasts/i)
    expect(first.limitations.join(' ')).toMatch(/do not represent live provider verification/i)
    expect(stableJson(first)).not.toContain('privateKey')
    expect(stableJson(first)).not.toContain('mnemonic')
  })

  it('does not fabricate a zero quote for unavailable Synthra', () => {
    const report = buildOfflineReport()
    const synthra = report.providers.find(({ provider }) => provider === 'synthra')!
    expect(synthra.status).toBe('unverified')
    expect(report.fixtureEvaluations.find(({ id }) => id === 'synthra-unavailable-fixture')?.status).toBe('unavailable')
    expect(synthra.quotes).toEqual([])
    expect(report.quoteMatrix.filter(({ provider }) => provider === 'synthra')).toHaveLength(10)
    expect(report.quoteMatrix.filter(({ provider }) => provider === 'synthra').every(({ outputRaw }) => outputRaw === undefined)).toBe(true)
    expect(synthra.executableTargets).toBeUndefined()
  })

  it('never exposes executable targets for fixture (non-executable) providers', () => {
    const report = buildOfflineReport()
    for (const provider of report.providers) {
      expect(provider.executableTargets).toBeUndefined()
      expect(provider.executable).toBe(false)
      expect(provider.candidateTargets.label).toBe('candidate-only-not-approved-for-execution')
    }
  })
})
