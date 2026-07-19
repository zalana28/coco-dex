import { z } from 'zod'
import { OFFLINE_AUDIT_CONTEXT, evaluateOfflineScenarios } from './fixtures'
import { ROUTER_AUDIT_REGISTRY } from './registry'
import type { LiveAuditReport } from './live'
import { auditReportMetaSchema, candidateTargetsSchema, evidenceSourceSchema, executableTargetsSchema, providerStatusSchema, quoteMatrixRowSchema, upgradeabilitySchema, type AuditReportMeta } from './types'

export function stableJson(value: unknown): string {
  const sort = (input: unknown): unknown => {
    if (typeof input === 'bigint') return input.toString()
    if (Array.isArray(input)) return input.map(sort)
    if (input && typeof input === 'object') {
      return Object.fromEntries(Object.entries(input as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sort(item)]))
    }
    return input
  }
  return `${JSON.stringify(sort(value), null, 2)}\n`
}

const offlineMeta: AuditReportMeta = {
  schemaVersion: 1,
  mode: 'offline-fixture',
  fixture: true,
  networkAccess: false,
  auditDate: 'deterministic-fixture',
  chainId: OFFLINE_AUDIT_CONTEXT.chainId,
  auditBlockNumber: OFFLINE_AUDIT_CONTEXT.auditBlockNumber,
  auditBlockHash: OFFLINE_AUDIT_CONTEXT.auditBlockHash,
  auditBlockTimestamp: OFFLINE_AUDIT_CONTEXT.auditBlockTimestamp,
  rpcProviderLabel: OFFLINE_AUDIT_CONTEXT.rpcProviderLabel,
  noBroadcastStatement: 'The audit transport never broadcasts, signs, unlocks accounts, or requests wallet interaction.',
}

const promotionSummarySchema = z.object({
  eligible: z.boolean(),
  status: z.enum(['verified-executable', 'non-executable']),
  failedRequirements: z.array(z.string()),
}).strict()

const candidateAddressRowSchema = z.object({
  label: z.string(),
  address: z.string(),
  role: z.string(),
  conflictGroup: z.string().optional(),
  conflictClass: z.string().optional(),
}).strict()

const offlineProviderReportSchema = z.object({
  provider: z.enum(['coco', 'xylonet', 'unitflow', 'synthra']),
  registryStatus: providerStatusSchema,
  status: providerStatusSchema,
  fixtureOnly: z.literal(true),
  executable: z.literal(false),
  candidateTargets: candidateTargetsSchema,
  executableTargets: z.undefined().optional(),
  promotion: promotionSummarySchema,
  candidateAddresses: z.array(candidateAddressRowSchema),
  verifiedAddresses: z.array(z.never()),
  proxy: upgradeabilitySchema,
  quotes: z.array(z.never()),
  simulations: z.array(z.never()),
  unresolvedIssues: z.array(z.string()),
  disableReason: z.string().optional(),
  evidenceSources: z.array(evidenceSourceSchema),
}).strict()

const proxyEvidenceItemSchema = z.object({
  label: z.string(),
  address: z.string(),
  proxy: upgradeabilitySchema,
}).strict()

const tokenReadResultSchema = z.object({
  symbol: z.string(),
  address: z.string(),
  expectedDecimals: z.number().int(),
  result: z.discriminatedUnion('succeeded', [
    z.object({ succeeded: z.literal(true), value: z.union([z.number(), z.string(), z.boolean(), z.array(z.union([z.string(), z.number(), z.boolean()]))]) }).strict(),
    z.object({ succeeded: z.literal(false), failureReason: z.string().min(1) }).strict(),
  ]),
}).strict()

const candidateEvidenceSchema = z.object({
  label: z.string(),
  address: z.string(),
  role: z.string(),
  codeExists: z.boolean(),
  runtimeCodeHash: z.string().optional(),
  expectedRuntimeCodeHash: z.string().optional(),
  codeHashMatched: z.boolean().optional(),
  proxy: upgradeabilitySchema,
  failureReason: z.string().optional(),
}).strict()

const promotionRequirementSchema = z.object({
  requirement: z.string().min(1),
  satisfied: z.boolean(),
  reason: z.string().optional(),
}).strict()

const liveProviderSummarySchema = z.object({
  provider: z.enum(['coco', 'xylonet', 'unitflow', 'synthra']),
  registryStatus: providerStatusSchema,
  status: providerStatusSchema,
  executable: z.boolean(),
  candidateTargets: candidateTargetsSchema,
  executableTargets: executableTargetsSchema.optional(),
  evidence: z.array(candidateEvidenceSchema),
  promotion: z.object({
    eligible: z.boolean(),
    status: z.enum(['verified-executable', 'non-executable']),
    failedRequirements: z.array(z.string()),
    requirements: z.array(promotionRequirementSchema).optional(),
  }).strict(),
  disableReason: z.string().optional(),
}).strict()

const liveProviderReportSchema = liveProviderSummarySchema.omit({ evidence: true }).extend({
  evidence: z.array(candidateEvidenceSchema),
  proxyEvidence: z.array(proxyEvidenceItemSchema).min(1),
})

export const offlineAuditReportSchema = auditReportMetaSchema.extend({
  mode: z.literal('offline-fixture'), fixture: z.literal(true), networkAccess: z.literal(false),
  limitations: z.array(z.string()),
  providers: z.array(offlineProviderReportSchema).length(4),
  quoteMatrix: z.array(quoteMatrixRowSchema).length(40),
  conflicts: z.array(z.object({ provider: z.string(), conflictGroup: z.string().optional(), conflictClass: z.string().optional(), label: z.string(), address: z.string() }).strict()),
  disabledProviders: z.array(z.object({ provider: z.string(), reason: z.string().optional() }).strict()),
  fixtureEvaluations: z.array(z.object({
    id: z.string(),
    provider: z.enum(['coco', 'xylonet', 'unitflow', 'synthra']),
    status: providerStatusSchema,
    expectedStatus: providerStatusSchema,
    passed: z.boolean(),
    fixtureOnly: z.literal(true),
    disableReason: z.string().optional(),
  }).strict()),
  fixtureWarning: z.string(),
}).strict().superRefine((report, ctx) => {
  for (const provider of ['coco', 'xylonet', 'unitflow', 'synthra'] as const) {
    const rows = report.quoteMatrix.filter((row) => row.provider === provider)
    const cells = new Set(rows.map((row) => `${row.amount}:${row.direction}`))
    if (rows.length !== 10 || cells.size !== 10) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${provider} requires exactly 10 unique offline quote matrix cells` })
  }
})

const conflictReportSchema = z.object({
  provider: z.string(), conflictGroup: z.string().optional(), conflictClass: z.string().optional(), label: z.string(), address: z.string(),
}).strict()
const disabledProviderReportSchema = z.object({ provider: z.string(), reason: z.string().optional() }).strict()

export const liveAuditReportSchema = auditReportMetaSchema.extend({
  mode: z.literal('live'), fixture: z.literal(false), networkAccess: z.literal(true),
  limitations: z.array(z.string()),
  tokens: z.array(tokenReadResultSchema),
  providers: z.array(liveProviderReportSchema).length(4),
  quoteMatrix: z.array(quoteMatrixRowSchema).length(40),
  conflicts: z.array(conflictReportSchema),
  disabledProviders: z.array(disabledProviderReportSchema),
}).strict().superRefine((report, ctx) => {
  const providerIds = new Set(report.providers.map(({ provider }) => provider))
  if (providerIds.size !== 4) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'live report requires exactly one entry per provider' })
  for (const provider of ['coco', 'xylonet', 'unitflow', 'synthra'] as const) {
    const rows = report.quoteMatrix.filter((row) => row.provider === provider)
    const cells = new Set(rows.map((row) => `${row.amount}:${row.direction}`))
    if (rows.length !== 10 || cells.size !== 10) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${provider} requires exactly 10 unique quote matrix cells` })
  }
  for (const row of report.quoteMatrix) {
    if (row.quoteBlockNumber !== report.auditBlockNumber || row.quoteBlockHash !== report.auditBlockHash) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${row.provider} quote row is not comparable to the report audit block` })
    }
  }
  for (const provider of report.providers) {
    if (!provider.executable && provider.executableTargets) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${provider.provider} is non-executable but exposes executable targets` })
  }
})

function offlineQuoteMatrix() {
  return (['coco', 'xylonet', 'unitflow', 'synthra'] as const).flatMap((provider) =>
    (['0.01', '0.1', '1', '10', '100'] as const).flatMap((amount) =>
      (['usdc-to-eurc', 'eurc-to-usdc'] as const).map((direction) => quoteMatrixRowSchema.parse({
        provider,
        amount,
        direction,
        quoteBlockNumber: OFFLINE_AUDIT_CONTEXT.auditBlockNumber,
        quoteBlockHash: OFFLINE_AUDIT_CONTEXT.auditBlockHash,
        outcome: 'verification-blocked',
        failureReason: 'Deterministic fixture row; no live network quote was attempted.',
      }))))
}

export function buildOfflineReport() {
  const evaluations = evaluateOfflineScenarios()
  return offlineAuditReportSchema.parse({
    ...offlineMeta,
    limitations: [
      'DETERMINISTIC OFFLINE FIXTURE: these results are test data and do not represent live provider verification.',
      'A fixture status must never be consumed as live registry status or promote a live provider to verified-executable.',
      'Simulation passed proves only that selected calldata did not revert under recorded assumptions; it is not a security or audit guarantee.',
    ],
    providers: ROUTER_AUDIT_REGISTRY.map((provider) => {
      const candidateTargets = candidateTargetsSchema.parse({ label: 'candidate-only-not-approved-for-execution', allowanceTarget: provider.router?.address, executionTarget: provider.router?.address })
      return {
        provider: provider.id,
        registryStatus: provider.status,
        status: provider.status,
        fixtureOnly: true,
        executable: false,
        candidateTargets,
        executableTargets: undefined,
        promotion: { eligible: false, status: 'non-executable' as const, failedRequirements: ['live-mode'] },
        candidateAddresses: [provider.factory, provider.router, provider.quoter, ...provider.pools, ...provider.inventoryCandidates, ...provider.conflictingCandidates].filter((item): item is NonNullable<typeof item> => item !== undefined).map(({ label, address, role, conflictGroup, conflictClass }) => ({ label, address, role, conflictGroup, conflictClass })),
        verifiedAddresses: [],
        proxy: provider.upgradeability,
        quotes: [],
        simulations: [],
        unresolvedIssues: [provider.disableReason].filter(Boolean),
        disableReason: provider.disableReason,
        evidenceSources: provider.evidenceSources,
      }
    }),
    quoteMatrix: offlineQuoteMatrix(),
    conflicts: ROUTER_AUDIT_REGISTRY.flatMap((provider) => provider.conflictingCandidates.filter(({ conflictGroup }) => conflictGroup).map(({ label, address, conflictGroup, conflictClass }) => ({ provider: provider.id, conflictGroup, conflictClass, label, address }))),
    disabledProviders: ROUTER_AUDIT_REGISTRY.filter(({ status }) => status !== 'verified-executable').map(({ id, disableReason }) => ({ provider: id, reason: disableReason })),
    fixtureEvaluations: evaluations,
    fixtureWarning: 'Fixture results are deterministic test data and do not represent live provider verification.',
  })
}

export function buildLiveReport(live: LiveAuditReport) {
  const meta: AuditReportMeta = auditReportMetaSchema.parse({
    schemaVersion: 1,
    mode: 'live',
    fixture: false,
    networkAccess: true,
    auditDate: live.auditDate,
    chainId: live.chainId,
    auditBlockNumber: live.auditBlockNumber,
    auditBlockHash: live.auditBlockHash,
    auditBlockTimestamp: live.auditBlockTimestamp,
    rpcProviderLabel: live.rpcProviderLabel,
    noBroadcastStatement: live.noBroadcastStatement,
  })
  return liveAuditReportSchema.parse({
    ...meta,
    limitations: live.limitations,
    tokens: live.tokens,
    providers: live.providers.map((provider) => ({
      provider: provider.provider,
      registryStatus: provider.registryStatus,
      status: provider.status,
      executable: provider.executable,
      candidateTargets: candidateTargetsSchema.parse(provider.candidateTargets),
      executableTargets: provider.executableTargets ? executableTargetsSchema.parse(provider.executableTargets) : undefined,
      promotion: { eligible: provider.promotion.eligible, status: provider.promotion.status, failedRequirements: provider.promotion.failedRequirements.map((req) => req.requirement) },
      evidence: provider.evidence,
      proxyEvidence: provider.evidence.map(({ label, address, proxy }) => ({ label, address, proxy })),
      disableReason: provider.disableReason,
    })),
    quoteMatrix: live.quoteMatrix.map((row) => quoteMatrixRowSchema.parse(row)),
    conflicts: ROUTER_AUDIT_REGISTRY.flatMap((provider) => provider.conflictingCandidates.filter(({ conflictGroup }) => conflictGroup).map(({ label, address, conflictGroup, conflictClass }) => ({ provider: provider.id, conflictGroup, conflictClass, label, address }))),
    disabledProviders: live.providers.filter(({ executable }) => !executable).map(({ provider, disableReason }) => ({ provider, reason: disableReason })),
  })
}

export function markdownReport(report: ReturnType<typeof buildOfflineReport> | ReturnType<typeof buildLiveReport>): string {
  const meta = 'mode' in report && 'fixture' in report ? (report as { mode: string; fixture: boolean; networkAccess: boolean }) : { mode: 'unknown', fixture: false, networkAccess: false }
  const lines = [
    '# Router audit report', '',
    `- Mode: ${meta.mode}`,
    `- Fixture: ${meta.fixture}`,
    `- Network access: ${meta.networkAccess}`,
    `- Chain ID: ${report.chainId}`,
    `- Audit block: ${report.auditBlockNumber}`,
    `- Audit block hash: ${report.auditBlockHash}`,
    `- RPC provider label: ${report.rpcProviderLabel}`,
    `- No broadcast: ${report.noBroadcastStatement}`,
    '', '## Limitations', '',
    ...report.limitations.map((item) => `- ${item}`),
    '', '## Providers', '',
    '| Provider | Status | Registry status | Executable | Disable reason |',
    '|---|---|---|---|---|',
    ...('providers' in report ? (report.providers as Array<{ provider: string; status: string; registryStatus?: string; executable: boolean; disableReason?: string }>).map((provider) => `| ${provider.provider} | ${provider.status} | ${provider.registryStatus ?? provider.status} | ${provider.executable ? 'yes' : 'no'} | ${provider.disableReason ?? 'verification incomplete'} |`) : []),
    '', '## Conflicts', '',
    ...('conflicts' in report ? (report.conflicts as Array<{ provider: string; conflictGroup?: string; label: string; address: string }>).map((conflict) => `- ${conflict.provider} / ${conflict.conflictGroup ?? 'unresolved'}: ${conflict.label} — ${conflict.address}`) : []),
    '', '## Disabled providers', '',
    ...('disabledProviders' in report ? (report.disabledProviders as Array<{ provider: string; reason?: string }>).map(({ provider, reason }) => `- ${provider}: ${reason ?? 'verification incomplete'}`) : []),
    '', '## Quote matrix', '',
    ...('quoteMatrix' in report ? (report.quoteMatrix as Array<{ provider: string; amount: string; direction: string; outcome: string }>).map((row) => `- ${row.provider} ${row.amount} ${row.direction}: ${row.outcome}`) : []),
    '',
  ]
  return lines.join('\n')
}

export function providerEvidenceMarkdown(report: ReturnType<typeof buildOfflineReport> | ReturnType<typeof buildLiveReport>, providerId: string): string {
  const provider = (report as { providers: Array<{ provider: string; status: string; executable: boolean; disableReason?: string; candidateAddresses?: Array<{ label: string; address: string; role: string }> }> }).providers.find(({ provider }) => provider === providerId)
  if (!provider) throw new Error(`unknown provider ${providerId}`)
  return [
    `# ${providerId} evidence summary`, '',
    `- Status: ${provider.status}`,
    `- Executable: ${provider.executable ? 'yes' : 'no'}`,
    `- Disable reason: ${provider.disableReason ?? 'verification incomplete'}`,
    '- Candidate addresses (not approved for execution):',
    ...(provider.candidateAddresses ?? []).map(({ label, address, role }) => `  - ${label} (${role}): ${address}`),
    '- A successful read or simulation does not prove security, audit status, or future execution.', '',
  ].join('\n')
}

export function conflictSummaryMarkdown(report: ReturnType<typeof buildOfflineReport> | ReturnType<typeof buildLiveReport>): string {
  const conflicts = (report as { conflicts?: Array<{ provider: string; conflictGroup?: string; conflictClass?: string; label: string; address: string }> }).conflicts ?? []
  return ['# Conflict summary', '', ...conflicts.map((item) => `- ${item.provider} / ${item.conflictGroup ?? 'unresolved'} (${item.conflictClass ?? 'unresolved-candidate'}): ${item.label} — ${item.address}`), ''].join('\n')
}

export function proxySummaryMarkdown(report: ReturnType<typeof buildOfflineReport> | ReturnType<typeof buildLiveReport>): string {
  const providers = report.providers as Array<{
    provider: string
    proxy?: { proxyKind: string; warning?: string }
    proxyEvidence?: Array<{ label: string; address: string; proxy: { proxyKind?: string; warning?: string } }>
  }>
  const lines = providers.flatMap((item) => item.proxyEvidence?.length
    ? item.proxyEvidence.map((evidence) => `- ${item.provider} / ${evidence.label} (${evidence.address}): ${evidence.proxy.proxyKind ?? 'unknown'}; ${evidence.proxy.warning ?? 'verification incomplete'}`)
    : [`- ${item.provider}: ${item.proxy?.proxyKind ?? 'unknown'}; ${item.proxy?.warning ?? 'verification incomplete'}`])
  return ['# Proxy summary', '', ...lines, ''].join('\n')
}

export function disabledSummaryMarkdown(report: ReturnType<typeof buildOfflineReport> | ReturnType<typeof buildLiveReport>): string {
  const disabled = (report as { disabledProviders?: Array<{ provider: string; reason?: string }> }).disabledProviders ?? []
  return ['# Disabled-provider summary', '', ...disabled.map(({ provider, reason }) => `- ${provider}: ${reason ?? 'verification incomplete'}`), ''].join('\n')
}

export function assertNoSensitiveArtifactContent(content: string): void {
  const forbidden = [
    /https?:\/\/[^\s"'<>]+[?&](?:api[_-]?key|token|secret)=/i,
    /authorization\s*:/i,
    /(?:bearer\s+[a-z0-9._~+/=-]+)/i,
    /(?:\/Users|\/home)\/[A-Za-z0-9._-]+\//,
    /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/,
  ]
  if (forbidden.some((pattern) => pattern.test(content))) throw new Error('report artifact contains sensitive or local-only data')
}

export { auditReportMetaSchema }
