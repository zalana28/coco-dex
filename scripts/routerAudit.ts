import { mkdirSync, writeFileSync } from 'node:fs'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  assertNoSensitiveArtifactContent,
  buildLiveReport,
  buildOfflineReport,
  markdownReport,
  providerEvidenceMarkdown,
  conflictSummaryMarkdown,
  proxySummaryMarkdown,
  disabledSummaryMarkdown,
  stableJson,
} from '../src/lib/router-audit/report'
import { bootstrapLiveAudit } from '../src/lib/router-audit/live'
import { publicAuditError, safeErrorCliText } from '../src/lib/router-audit/safeError'

const args = new Set(process.argv.slice(2))
const offline = args.has('--offline-fixtures')

function fail(message: string, error?: unknown): never {
  const safe = publicAuditError(message, error, { category: 'report', operation: 'routers:audit', code: 'CLI_FAILURE', retryable: false })
  process.stderr.write(`${safeErrorCliText(safe)}\n`)
  process.exitCode = 1
  process.exit(1)
}

function sanitizeLabel(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return 'operator-supplied Arc RPC'
  // Reject anything that looks like a URL, path, credential, or control/markdown metacharacters.
  if (/https?:\/\//i.test(trimmed) || /[/?#]/.test(trimmed) || /(?:api[_-]?key|token|secret|password|bearer|authorization)/i.test(trimmed)) {
    fail('ARC_TESTNET_RPC_LABEL must be a short human-readable label; URLs, paths, and credentials are rejected.')
  }
  let hasControl = false
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) { hasControl = true; break }
  }
  if (hasControl || /[`*_~<>\\[\]]/.test(trimmed)) {
    fail('ARC_TESTNET_RPC_LABEL must not contain control or Markdown metacharacters.')
  }
  if (trimmed.length > 80) fail('ARC_TESTNET_RPC_LABEL must be at most 80 characters.')
  return trimmed
}

let baseDir: string
let outputDirectory: string
try {
  baseDir = resolve(process.env.ROUTER_AUDIT_ARTIFACT_ROOT ?? resolve(process.cwd(), 'artifacts/router-audit'))
  outputDirectory = resolve(baseDir, offline ? 'offline' : 'live')
  mkdirSync(outputDirectory, { recursive: true })
} catch (error) {
  fail('Failed to resolve or create the router-audit output directory.', error)
}

function writeSafe(name: string, content: string) {
  try {
    assertNoSensitiveArtifactContent(content)
    writeFileSync(resolve(outputDirectory, name), content)
  } catch (error) {
    fail(`Failed to write artifact ${name}.`, error)
  }
}

try {
  if (offline) {
    const report = buildOfflineReport()
    if (report.fixtureEvaluations.some(({ passed }) => !passed)) throw new Error('offline fixture status transition mismatch')
    writeSafe('audit-report.json', stableJson(report))
    writeSafe('audit-report.md', markdownReport(report))
    for (const provider of report.providers) writeSafe(`${provider.provider}-evidence.md`, providerEvidenceMarkdown(report, provider.provider))
    writeSafe('conflict-summary.md', conflictSummaryMarkdown(report))
    writeSafe('proxy-summary.md', proxySummaryMarkdown(report))
    writeSafe('disabled-provider-summary.md', disabledSummaryMarkdown(report))
    console.log(`Router audit offline fixtures passed: ${report.fixtureEvaluations.length} deterministic scenarios`)
    console.log(`Artifacts written under ${outputDirectory} (gitignored)`)
  } else {
    const rpcUrl = process.env.ARC_TESTNET_RPC_URL
    if (!rpcUrl) throw new Error('ARC_TESTNET_RPC_URL must be explicitly supplied for a live read-only audit')
    const providerLabel = sanitizeLabel(process.env.ARC_TESTNET_RPC_LABEL ?? '')
    const live = await bootstrapLiveAudit(rpcUrl, providerLabel)
    const report = buildLiveReport(live)
    const json = stableJson(report)
    assertNoSensitiveArtifactContent(json)
    writeSafe('audit-report.json', json)
    writeSafe('audit-report.md', [
      '# Live router audit report', '',
      `- Mode: ${report.mode}`,
      `- Fixture: ${report.fixture}`,
      `- Network access: ${report.networkAccess}`,
      `- Audit date: ${report.auditDate}`,
      `- Chain ID: ${report.chainId}`,
      `- Audit block: ${report.auditBlockNumber}`,
      `- Block hash: ${report.auditBlockHash}`,
      `- Block timestamp: ${report.auditBlockTimestamp}`,
      `- RPC provider label: ${report.rpcProviderLabel}`,
      `- No broadcast: ${report.noBroadcastStatement}`,
      '', '## Provider statuses', '',
      ...report.providers.map((p) => `- ${p.provider}: ${p.status}; executable: ${p.executable ? 'yes' : 'no'}; failed promotion: ${p.promotion.failedRequirements.length}`),
      '', '## Limitations', '', ...report.limitations.map((item) => `- ${item}`), '',
    ].join('\n'))
    for (const provider of report.providers) {
      writeSafe(`${provider.provider}-evidence.md`, [
        `# ${provider.provider} live evidence summary`, '',
        `- Status: ${provider.status}`,
        `- Executable: ${provider.executable ? 'yes' : 'no'}`,
        `- Disable reason: ${provider.disableReason ?? 'none'}`,
        `- Audit block: ${report.auditBlockNumber}`,
        `- Audit block hash: ${report.auditBlockHash}`,
        '- Candidate targets (not approved for execution):',
        `  - allowanceTarget: ${provider.candidateTargets.allowanceTarget ?? 'none'}`,
        `  - executionTarget: ${provider.candidateTargets.executionTarget ?? 'none'}`,
        '- Executable targets:',
        `  - ${provider.executableTargets ? `${provider.executableTargets.allowanceTarget} / ${provider.executableTargets.executionTarget}` : 'none (non-executable provider)'}`, '',
      ].join('\n'))
    }
    writeSafe('conflict-summary.md', conflictSummaryMarkdown(report))
    writeSafe('proxy-summary.md', proxySummaryMarkdown(report))
    writeSafe('disabled-provider-summary.md', disabledSummaryMarkdown(report))
    writeSafe('quote-matrix.md', [
      '# Live quote matrix', '',
      '| Provider | Amount | Direction | Outcome | Output | Failure reason |',
      '|---|---|---|---|---|---|',
      ...report.quoteMatrix.map((row) => `| ${row.provider} | ${row.amount} | ${row.direction} | ${row.outcome} | ${row.outputRaw ?? ''} | ${row.failureReason ?? ''} |`),
      '',
    ].join('\n'))
    console.log(`Router audit completed at Arc block ${report.auditBlockNumber} (${report.rpcProviderLabel})`)
    console.log('No transaction was broadcast or signed. RPC URL and credentials were not printed.')
    console.log(`Artifacts written under ${outputDirectory} (gitignored)`)
  }
} catch (error) {
  const safe = error instanceof Error && (error as { name?: string }).name === 'PublicAuditError'
    ? error
    : publicAuditError(offline ? 'Offline router audit failed' : 'Live router audit failed', error, { category: 'report', operation: 'routers:audit', code: offline ? 'OFFLINE_AUDIT_FAILED' : 'LIVE_AUDIT_FAILED', retryable: false })
  process.stderr.write(`${safeErrorCliText(safe)}\n`)
  process.exitCode = 1
}

export { baseDir, outputDirectory, existsSync, readdirSync, readFileSync }
