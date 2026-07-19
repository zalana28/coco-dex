import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, afterAll } from 'vitest'
import { buildOfflineReport, buildLiveReport, liveAuditReportSchema, offlineAuditReportSchema, stableJson } from '../src/lib/router-audit/report'
import type { LiveAuditReport } from '../src/lib/router-audit/live'
import { assertExecutableTargetsConsistency } from '../src/lib/router-audit/types'

const sandbox = mkdtempSync(join(tmpdir(), 'router-audit-isolation-'))
const liveDir = join(sandbox, 'live')
const offlineDir = join(sandbox, 'offline')
mkdirSync(liveDir, { recursive: true })
mkdirSync(offlineDir, { recursive: true })

function runOfflineCli() {
  execFileSync('npx', ['tsx', 'scripts/routerAudit.ts', '--offline-fixtures'], {
    cwd: process.cwd(),
    env: { ...process.env, ROUTER_AUDIT_ARTIFACT_ROOT: sandbox },
    stdio: 'pipe',
  })
}

describe('live/offline artifact isolation', () => {
  it('produces deterministic offline reports', () => {
    expect(stableJson(buildOfflineReport())).toBe(stableJson(buildOfflineReport()))
  })

  it('exposes a clear mode/fixture/networkAccess discriminator', () => {
    const offline = buildOfflineReport()
    expect(offline.mode).toBe('offline-fixture')
    expect(offline.fixture).toBe(true)
    expect(offline.networkAccess).toBe(false)
    expect(offline.limitations.join(' ')).toMatch(/do not represent live provider verification/i)
  })

  it('runs the offline CLI without touching a live sentinel', () => {
    writeFileSync(join(liveDir, 'SENTINEL_LIVE.md'), 'do-not-delete')
    runOfflineCli()
    expect(existsSync(join(liveDir, 'SENTINEL_LIVE.md'))).toBe(true)
    expect(existsSync(join(offlineDir, 'audit-report.json'))).toBe(true)
  })

  it('preserves an offline sentinel across repeated CLI runs', () => {
    writeFileSync(join(offlineDir, 'SENTINEL_OFFLINE.md'), 'do-not-delete')
    runOfflineCli()
    runOfflineCli()
    expect(existsSync(join(offlineDir, 'SENTINEL_OFFLINE.md'))).toBe(true)
  })

  it('rejects fixture results promoting a live provider to verified-executable', () => {
    expect(() => assertExecutableTargetsConsistency({ status: 'verified-executable', fixture: true, executableTargets: { allowanceTarget: '0x1111111111111111111111111111111111111111' as `0x${string}`, executionTarget: '0x1111111111111111111111111111111111111111' as `0x${string}` } })).toThrow(/offline fixture/)
  })

  it('accepts a valid offline report and rejects unknown top-level fields', () => {
    const offline = buildOfflineReport()
    expect(offlineAuditReportSchema.parse(offline)).toEqual(offline)
    expect(() => offlineAuditReportSchema.parse({ ...offline, unexpected: true })).toThrow()
  })

  it('requires a live report to carry mode live and fixture false', () => {
    const offline = buildOfflineReport()
    const quoteMatrix = (['coco', 'xylonet', 'unitflow', 'synthra'] as const).flatMap((provider) =>
      (['0.01', '0.1', '1', '10', '100'] as const).flatMap((amount) =>
        (['usdc-to-eurc', 'eurc-to-usdc'] as const).map((direction) => ({
          provider, amount, direction, quoteBlockNumber: offline.auditBlockNumber, quoteBlockHash: offline.auditBlockHash,
          outcome: 'verification-blocked' as const, failureReason: 'fixture row',
        }))))
    const asLive = {
      ...offline,
      mode: 'live' as const,
      fixture: false,
      networkAccess: true,
      quoteMatrix,
      tokens: [],
      providers: offline.providers.map((p) => ({
        ...p,
        evidence: [{
          label: `${p.provider} candidate`,
          address: p.candidateTargets.executionTarget ?? '0x1111111111111111111111111111111111111111',
          role: 'router',
          codeExists: false,
          proxy: {
            proxyKind: 'unknown',
            mutable: true,
            requiresReauditOnUpgrade: true,
            warning: 'proxy state unresolved',
          },
          failureReason: 'missing bytecode',
        }],
        promotion: { eligible: false, status: 'non-executable' as const, failedRequirements: [{ requirement: 'live-mode' as const, result: false as const }] },
      })),
    }
    const built = buildLiveReport(asLive as unknown as LiveAuditReport)
    expect(built.mode).toBe('live')
    expect(built.fixture).toBe(false)
    expect(built.networkAccess).toBe(true)
    expect(built.conflicts.length).toBeGreaterThan(0)
    expect(built.disabledProviders).toHaveLength(4)
    expect(built.providers.every((provider) => provider.proxyEvidence.length > 0)).toBe(true)
    expect(liveAuditReportSchema.parse(built)).toEqual(built)
    expect(() => liveAuditReportSchema.parse({ ...built, unexpected: true })).toThrow()
  })
})

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true })
})
