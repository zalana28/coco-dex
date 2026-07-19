import { z } from 'zod'

export const ARC_TESTNET_CHAIN_ID = 5_042_002

export const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'expected a 20-byte hex address')
  .transform((value) => value.toLowerCase() as `0x${string}`)

export const hexBytes32Schema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'expected a 32-byte hex value')
  .transform((value) => value.toLowerCase() as `0x${string}`)

export const providerStatuses = [
  'verified-executable',
  'verified-quote-only',
  'unverified',
  'unavailable',
  'disabled',
] as const
export const providerStatusSchema = z.enum(providerStatuses)
export type ProviderStatus = z.infer<typeof providerStatusSchema>

export const protocolTypeSchema = z.enum([
  'coco-classic-v2',
  'xylo-stable',
  'unitflow-v25',
  'unitflow-v3',
  'unitflow-v4',
  'unitflow-universal-router',
  'synthra-v3',
  'unknown',
])
export type ProtocolType = z.infer<typeof protocolTypeSchema>

export const evidenceSourceSchema = z.object({
  kind: z.enum([
    'repo-deployment-json',
    'compiled-artifact',
    'runtime-bytecode',
    'verified-explorer-source',
    'official-repository',
    'official-deployment-file',
    'official-documentation',
    'unitflowOfficialContracts',
    'unitflowOfficialVersionDocs',
    'unitflowOfficialRepository',
    'unitflowOfficialDeploymentArtifact',
    'unitflowFrontendObserved',
    'operatorSuppliedCandidate',
    'verifiedArcscan',
    'runtimeDiscovered',
    'provider-frontend-config',
  ]),
  reference: z.string().min(1),
  weight: z.enum(['authoritative', 'secondary']),
  retrievedOn: z.string().datetime({ message: 'expected an ISO retrieval date' }).optional(),
  note: z.string().optional(),
})
export type EvidenceSource = z.infer<typeof evidenceSourceSchema>

export const conflictCategorySchema = z.enum([
  'official-vs-official',
  'official-vs-frontend',
  'official-vs-runtime',
  'frontend-vs-runtime',
  'unresolved-candidate',
  'stale-frontend-candidate',
])
export type ConflictCategory = z.infer<typeof conflictCategorySchema>

export const tokenSymbolSchema = z.enum(['USDC', 'EURC', 'WUSDC'])
export const tokenDescriptorSchema = z.object({
  symbol: tokenSymbolSchema,
  address: addressSchema,
  decimals: z.number().int().min(0).max(36),
  underlyingAsset: addressSchema.optional(),
  applicationAmountUnit: z.enum(['erc20-6-decimal', 'unknown']),
})
export type TokenDescriptor = z.infer<typeof tokenDescriptorSchema>

export const candidateContractSchema = z.object({
  label: z.string().min(1),
  address: addressSchema,
  role: z.enum([
    'factory',
    'router',
    'liquidity-router',
    'quoter',
    'pool',
    'pair',
    'position-manager',
    'position-descriptor',
    'pool-manager',
    'universal-router',
    'permit2',
    'wrapper',
    'multicall',
    'tick-lens',
    'nft',
    'other',
  ]),
  provenance: z.array(evidenceSourceSchema).min(1),
  conflictGroup: z.string().optional(),
  conflictClass: conflictCategorySchema.optional(),
  expectedRuntimeCodeHash: hexBytes32Schema.optional(),
})
export type CandidateContract = z.infer<typeof candidateContractSchema>

export const upgradeabilitySchema = z.object({
  proxyKind: z.enum([
    'none',
    'eip1967',
    'eip1967-beacon',
    'transparent',
    'uups',
    'eip1167',
    'delegatecall-forwarder',
    'unknown',
  ]),
  implementationAddress: addressSchema.optional(),
  implementationRuntimeCodeHash: hexBytes32Schema.optional(),
  beaconAddress: addressSchema.optional(),
  beaconImplementationAddress: addressSchema.optional(),
  proxyAdmin: addressSchema.optional(),
  upgradeAuthority: addressSchema.optional(),
  mutable: z.boolean(),
  requiresReauditOnUpgrade: z.boolean(),
  warning: z.string().optional(),
})
export type Upgradeability = z.infer<typeof upgradeabilitySchema>

export const verificationChecksSchema = z.object({
  address: z.boolean(),
  bytecode: z.boolean(),
  implementation: z.boolean(),
  abi: z.boolean(),
  poolRelationship: z.boolean(),
  tokenDecimals: z.boolean(),
  allowanceTarget: z.boolean(),
  quotePath: z.boolean(),
  executionSimulation: z.boolean(),
})

const directionSchema = z.enum(['usdc-to-eurc', 'eurc-to-usdc'])

export const providerEntrySchema = z
  .object({
    id: z.enum(['coco', 'xylonet', 'unitflow', 'synthra']),
    displayName: z.string().min(1),
    chainId: z.literal(ARC_TESTNET_CHAIN_ID),
    protocolType: protocolTypeSchema,
    status: providerStatusSchema,
    router: candidateContractSchema.optional(),
    factory: candidateContractSchema.optional(),
    quoter: candidateContractSchema.optional(),
    pools: z.array(candidateContractSchema),
    inventoryCandidates: z.array(candidateContractSchema),
    conflictingCandidates: z.array(candidateContractSchema),
    poolDiscoveryMethod: z.string().min(1),
    allowanceTarget: addressSchema.optional(),
    executionTarget: addressSchema.optional(),
    supportedTokens: z.array(tokenDescriptorSchema).min(2),
    supportedPairs: z.array(z.tuple([tokenSymbolSchema, tokenSymbolSchema])).min(1),
    quoteDirections: z.array(directionSchema),
    executionDirections: z.array(directionSchema),
    abiProvenance: z.array(evidenceSourceSchema),
    documentationProvenance: z.array(evidenceSourceSchema),
    sourceCodeProvenance: z.array(evidenceSourceSchema),
    expectedProxyRuntimeCodeHash: hexBytes32Schema.optional(),
    expectedImplementationRuntimeCodeHash: hexBytes32Schema.optional(),
    verificationChecks: verificationChecksSchema.optional(),
    lastVerifiedBlock: z.number().int().nonnegative().optional(),
    lastVerifiedBlockHash: hexBytes32Schema.optional(),
    lastVerifiedTimestamp: z.string().datetime().optional(),
    disableReason: z.string().min(1).optional(),
    upgradeability: upgradeabilitySchema,
    evidenceSources: z.array(evidenceSourceSchema).min(1),
  })
  .superRefine((entry, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message })
    if (entry.status === 'verified-executable') {
      for (const field of ['router', 'allowanceTarget', 'executionTarget', 'verificationChecks'] as const) {
        if (!entry[field]) issue(`verified-executable provider requires ${field}`)
      }
      if (entry.executionDirections.length === 0) issue('verified-executable provider requires execution directions')
      if (entry.verificationChecks && Object.values(entry.verificationChecks).some((passed) => !passed)) {
        issue('verified-executable provider requires every mandatory verification check')
      }
    } else if (!entry.disableReason) {
      issue(`${entry.status} provider requires an explicit disable reason`)
    }
    if (entry.status === 'verified-quote-only' && (entry.allowanceTarget || entry.executionTarget)) {
      issue('quote-only provider must not expose approval or execution targets')
    }
    if (entry.status !== 'verified-executable' && entry.executionDirections.length > 0) {
      issue('non-executable provider must not expose execution directions')
    }
  })

export type ProviderEntry = z.infer<typeof providerEntrySchema>

export const routerRegistrySchema = z
  .array(providerEntrySchema)
  .length(4)
  .superRefine((entries, ctx) => {
    const ids = new Set<string>()
    const addresses = new Map<string, string>()
    for (const entry of entries) {
      if (ids.has(entry.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate provider id ${entry.id}` })
      }
      ids.add(entry.id)
      for (const candidate of [entry.router, entry.factory, entry.quoter, ...entry.pools, ...entry.inventoryCandidates, ...entry.conflictingCandidates]) {
        if (!candidate) continue
        const prior = addresses.get(candidate.address)
        if (prior) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `duplicate contract address ${candidate.address} used by ${prior} and ${entry.id}:${candidate.label}`,
          })
        } else {
          addresses.set(candidate.address, `${entry.id}:${candidate.label}`)
        }
      }
    }
  })
export type RouterRegistry = z.infer<typeof routerRegistrySchema>

export const auditModeSchema = z.enum(['live', 'offline-fixture'])
export type AuditMode = z.infer<typeof auditModeSchema>

export const quoteOutcomeSchema = z.enum([
  'quote-succeeded',
  'unsupported-direction',
  'authoritative-abi-unresolved',
  'missing-liquidity',
  'call-reverted',
  'malformed-result',
  'historical-state-unavailable',
  'provider-unavailable',
  'verification-blocked',
])
export type QuoteOutcome = z.infer<typeof quoteOutcomeSchema>

export const quoteMatrixRowSchema = z.object({
  provider: z.enum(['coco', 'xylonet', 'unitflow', 'synthra']),
  amount: z.enum(['0.01', '0.1', '1', '10', '100']),
  direction: z.enum(['usdc-to-eurc', 'eurc-to-usdc']),
  quoteBlockNumber: z.number().int().nonnegative(),
  quoteBlockHash: hexBytes32Schema,
  outcome: quoteOutcomeSchema,
  outputRaw: z.string().regex(/^[0-9]+$/).optional(),
  failureReason: z.string().min(1).optional(),
}).strict().superRefine((row, ctx) => {
  if (row.outcome === 'quote-succeeded') {
    if (!row.outputRaw || BigInt(row.outputRaw) <= 0n) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'quote-succeeded requires positive outputRaw' })
  } else {
    if (row.outputRaw !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'non-success quote outcome must not expose outputRaw' })
    if (!row.failureReason) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'non-success quote outcome requires failureReason' })
  }
})
export type QuoteMatrixRow = z.infer<typeof quoteMatrixRowSchema>

export const candidateTargetsSchema = z.object({
  label: z.literal('candidate-only-not-approved-for-execution'),
  allowanceTarget: addressSchema.optional(),
  executionTarget: addressSchema.optional(),
}).strict()
export type CandidateTargets = z.infer<typeof candidateTargetsSchema>

export const executableTargetsSchema = z.object({
  allowanceTarget: addressSchema,
  executionTarget: addressSchema,
}).strict()
export type ExecutableTargets = z.infer<typeof executableTargetsSchema>

export const promotionGateResultSchema = z.object({
  eligible: z.boolean(),
  status: z.enum(['verified-executable', 'non-executable']),
  failedRequirements: z.array(z.string()),
})
export type PromotionGateResult = z.infer<typeof promotionGateResultSchema>

export const auditReportMetaSchema = z.object({
  schemaVersion: z.literal(1),
  mode: auditModeSchema,
  fixture: z.boolean(),
  networkAccess: z.boolean(),
  auditDate: z.string(),
  chainId: z.literal(ARC_TESTNET_CHAIN_ID),
  auditBlockNumber: z.number().int().nonnegative(),
  auditBlockHash: hexBytes32Schema,
  auditBlockTimestamp: z.number().int().nonnegative(),
  rpcProviderLabel: z.string(),
  noBroadcastStatement: z.string(),
})
export type AuditReportMeta = z.infer<typeof auditReportMetaSchema>

export function assertExecutableTargetsConsistency(input: {
  status: string
  fixture?: boolean
  executableTargets?: ExecutableTargets
  approvalCalldata?: string
  transactionCalldata?: string
}): void {
  if (input.status !== 'verified-executable' && input.executableTargets) {
    throw new Error('non-executable provider must not expose executable targets')
  }
  if (input.status !== 'verified-executable' && (input.approvalCalldata || input.transactionCalldata)) {
    throw new Error('non-executable provider must not produce approval or transaction calldata')
  }
  if (input.fixture && input.status === 'verified-executable') {
    throw new Error('offline fixture results must never promote a live provider to verified-executable')
  }
}

export const emptyVerificationChecks = (): z.infer<typeof verificationChecksSchema> => ({
  address: false,
  bytecode: false,
  implementation: false,
  abi: false,
  poolRelationship: false,
  tokenDecimals: false,
  allowanceTarget: false,
  quotePath: false,
  executionSimulation: false,
})
