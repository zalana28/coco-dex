import {
  decodeFunctionResult,
  encodeFunctionData,
  keccak256,
  parseUnits,
  type Abi,
  type Hex,
} from 'viem'
import deployment from '../../../contracts/deployments/classic-v2-arc-testnet.json'
import { createAuditContext, resolveProxy, toUpgradeability, type AuditContext, type RpcReader } from './audit'
import { ROUTER_AUDIT_REGISTRY } from './registry'
import { redactSensitiveText } from './safeError'
import { createReadOnlyRpcTransport } from './transport'
import {
  allPromotionFacts,
  evaluateExecutablePromotion,
  type PromotionFacts,
  type PromotionGateResult,
} from './promotion'
import {
  assertExecutableTargetsConsistency,
  executableTargetsSchema,
  quoteMatrixRowSchema,
  type CandidateTargets,
  type ExecutableTargets,
  type QuoteMatrixRow,
  type QuoteOutcome,
} from './types'

const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000' as const
const SIMULATION_SENDER = '0x42b10b337a5692743d587134c89a725422c3dffb' as const
export const QUOTE_INPUTS = ['0.01', '0.1', '1', '10', '100'] as const
export const QUOTE_DIRECTIONS = ['usdc-to-eurc', 'eurc-to-usdc'] as const

const erc20Abi = [{ type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] }] as const satisfies Abi
const factoryAbi = [{ type: 'function', name: 'getPair', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'address' }] }] as const satisfies Abi
const routerAbi = [
  { type: 'function', name: 'factory', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'getAmountsOut', stateMutability: 'view', inputs: [{ type: 'uint256' }, { type: 'address[]' }], outputs: [{ type: 'uint256[]' }] },
  { type: 'function', name: 'swapExactTokensForTokens', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'address[]' }, { type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'uint256[]' }] },
] as const satisfies Abi
const pairAbi = [
  { type: 'function', name: 'factory', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'token0', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'token1', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'getReserves', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint112' }, { type: 'uint112' }, { type: 'uint32' }] },
] as const satisfies Abi
const xyloThreeArgAbi = [{ type: 'function', name: 'getAmountOut', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'uint256' }] }] as const satisfies Abi
const xyloFourArgAbi = [{ type: 'function', name: 'getAmountOut', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'uint256' }] }] as const satisfies Abi
const unitflowV25QuoteAbi = [{ type: 'function', name: 'getAmountsOut', stateMutability: 'view', inputs: [{ type: 'uint256' }, { type: 'address[]' }], outputs: [{ type: 'uint256[]' }] }] as const satisfies Abi

type CandidateEvidence = {
  label: string
  address: string
  role: string
  codeExists: boolean
  runtimeCodeHash?: string
  expectedRuntimeCodeHash?: string
  codeHashMatched?: boolean
  proxy: ReturnType<typeof toUpgradeability>
  failureReason?: string
}

type CallResult = { succeeded: true; value: unknown } | { succeeded: false; failureReason: string }

async function readContract(rpc: RpcReader, blockTag: Hex, address: Hex, abi: Abi, functionName: string, args: readonly unknown[] = []): Promise<CallResult> {
  try {
    const data = encodeFunctionData({ abi, functionName, args })
    const result = await rpc.request('eth_call', [{ to: address, data }, blockTag]) as Hex
    return { succeeded: true, value: decodeFunctionResult({ abi, functionName, data: result }) }
  } catch (error) {
    return { succeeded: false, failureReason: redactSensitiveText(error instanceof Error ? error.message : String(error)) }
  }
}

async function inspectCandidate(rpc: RpcReader, blockTag: Hex, candidate: { label: string; address: string; role: string; expectedRuntimeCodeHash?: string }): Promise<CandidateEvidence> {
  const base = { label: candidate.label, address: candidate.address, role: candidate.role }
  let code: Hex
  let codeReadFailed = false
  let codeReadFailure: string | undefined
  try {
    code = await rpc.request('eth_getCode', [candidate.address, blockTag]) as Hex
  } catch (error) {
    code = '0x'
    codeReadFailed = true
    codeReadFailure = redactSensitiveText(error instanceof Error ? error.message : String(error))
  }
  // Always invoke resolveProxy so implementation/beacon/canonical-admin/supplied-admin slots are
  // read for every candidate, even when runtime code read fails or code is empty.
  const proxyResolution = await resolveProxy(rpc, candidate.address as Hex, code, blockTag)
  if (codeReadFailed) {
    return {
      ...base,
      codeExists: false,
      proxy: toUpgradeability({ ...proxyResolution, status: 'unknown', readsFailed: true, warning: 'Runtime code read failed; proxy state unresolved.' }),
      failureReason: codeReadFailure,
    }
  }
  if (code === '0x') {
    return { ...base, codeExists: false, proxy: toUpgradeability(proxyResolution), failureReason: 'missing bytecode' }
  }
  const runtimeCodeHash = keccak256(code)
  return {
    ...base,
    codeExists: true,
    runtimeCodeHash,
    codeHashMatched: candidate.expectedRuntimeCodeHash ? runtimeCodeHash.toLowerCase() === candidate.expectedRuntimeCodeHash.toLowerCase() : undefined,
    proxy: toUpgradeability(proxyResolution),
  }
}

function lower(value: unknown): string | undefined {
  return typeof value === 'string' ? value.toLowerCase() : undefined
}

function classifyCallFailure(reason: string): 'historical-state-unavailable' | 'authoritative-abi-unresolved' {
  return /historical|state unavailable|missing trie|header not found|block[^a-z]+not found/i.test(reason)
    ? 'historical-state-unavailable'
    : 'authoritative-abi-unresolved'
}

function buildCandidateTargets(allowanceTarget?: string, executionTarget?: string): CandidateTargets {
  return {
    label: 'candidate-only-not-approved-for-execution',
    allowanceTarget: allowanceTarget ? (allowanceTarget.toLowerCase() as `0x${string}`) : undefined,
    executionTarget: executionTarget ? (executionTarget.toLowerCase() as `0x${string}`) : undefined,
  }
}

export async function runLiveAudit(rpcUrl: string, providerLabel: string) {
  const bootstrap = createReadOnlyRpcTransport(rpcUrl, { providerLabel })
  const context = await createAuditContext(bootstrap)
  const rpc = createReadOnlyRpcTransport(rpcUrl, { providerLabel, fixedBlockTag: context.auditBlockTag })
  const auditMatrixRow = (row: Omit<QuoteMatrixRow, 'quoteBlockNumber' | 'quoteBlockHash'>): QuoteMatrixRow => quoteMatrixRowSchema.parse({
    ...row,
    quoteBlockNumber: context.auditBlockNumber,
    quoteBlockHash: context.auditBlockHash,
  })
  const candidates = ROUTER_AUDIT_REGISTRY.flatMap((provider) => [provider.factory, provider.router, provider.quoter, ...provider.pools, ...provider.inventoryCandidates, ...provider.conflictingCandidates]
    .filter((item): item is NonNullable<typeof item> => item !== undefined)
    .map((item) => ({ provider: provider.id, label: item.label, address: item.address, role: item.role, expectedRuntimeCodeHash: item.expectedRuntimeCodeHash })))
  const inspected: Array<{ provider: string; evidence: CandidateEvidence }> = []
  for (const item of candidates) {
    inspected.push({ provider: item.provider, evidence: await inspectCandidate(rpc, context.auditBlockTag, item) })
  }

  const coco = ROUTER_AUDIT_REGISTRY.find(({ id }) => id === 'coco')!
  const tokenReads: Array<{ symbol: string; address: string; expectedDecimals: number; result: CallResult }> = []
  for (const token of coco.supportedTokens) {
    tokenReads.push({ symbol: token.symbol, address: token.address, expectedDecimals: token.decimals, result: await readContract(rpc, context.auditBlockTag, token.address, erc20Abi, 'decimals') })
  }

  const usdc = deployment.tokenA.toLowerCase() as Hex
  const eurc = deployment.tokenB.toLowerCase() as Hex
  const factory = deployment.factory.toLowerCase() as Hex
  const router = deployment.router.toLowerCase() as Hex
  const pair = deployment.pair.toLowerCase() as Hex
  const routerFactory = await readContract(rpc, context.auditBlockTag, router, routerAbi, 'factory')
  const pairForward = await readContract(rpc, context.auditBlockTag, factory, factoryAbi, 'getPair', [usdc, eurc])
  const pairReverse = await readContract(rpc, context.auditBlockTag, factory, factoryAbi, 'getPair', [eurc, usdc])
  const pairFactory = await readContract(rpc, context.auditBlockTag, pair, pairAbi, 'factory')
  const token0 = await readContract(rpc, context.auditBlockTag, pair, pairAbi, 'token0')
  const token1 = await readContract(rpc, context.auditBlockTag, pair, pairAbi, 'token1')
  const reservesResult = await readContract(rpc, context.auditBlockTag, pair, pairAbi, 'getReserves')

  const token0Address = token0.succeeded ? lower(token0.value) : undefined
  const token1Address = token1.succeeded ? lower(token1.value) : undefined
  const relationshipsMatched =
    routerFactory.succeeded && lower(routerFactory.value) === factory &&
    pairForward.succeeded && lower(pairForward.value) === pair &&
    pairReverse.succeeded && lower(pairReverse.value) === pair &&
    pairFactory.succeeded && lower(pairFactory.value) === factory &&
    token0Address !== undefined && token1Address !== undefined && new Set([token0Address, token1Address]).size === 2 &&
    new Set([token0Address, token1Address]).has(usdc) && new Set([token0Address, token1Address]).has(eurc)

  const quoteMatrix: QuoteMatrixRow[] = []
  const cocoQuoteRows: typeof quoteMatrix = []

  if (reservesResult.succeeded && Array.isArray(reservesResult.value) && token0Address) {
    for (const amountLabel of QUOTE_INPUTS) {
      for (const direction of QUOTE_DIRECTIONS) {
        const tokenIn = direction === 'usdc-to-eurc' ? usdc : eurc
        const tokenOut = direction === 'usdc-to-eurc' ? eurc : usdc
        const amountIn = parseUnits(amountLabel, 6)
        const chainQuote = await readContract(rpc, context.auditBlockTag, router, routerAbi, 'getAmountsOut', [amountIn, [tokenIn, tokenOut]])
        const amounts = chainQuote.succeeded && Array.isArray(chainQuote.value) ? chainQuote.value as readonly bigint[] : undefined
        const outputRaw = amounts?.[1]
        const outcome: QuoteOutcome = !chainQuote.succeeded
          ? 'call-reverted'
          : outputRaw === undefined || outputRaw === 0n
            ? 'missing-liquidity'
            : 'quote-succeeded'
        const row = auditMatrixRow({
          provider: 'coco', amount: amountLabel, direction, outcome,
          outputRaw: outcome === 'quote-succeeded' ? outputRaw?.toString() : undefined,
          failureReason: outcome === 'quote-succeeded' ? undefined : chainQuote.succeeded ? 'Quote returned zero or missing output.' : chainQuote.failureReason,
        })
        quoteMatrix.push(row)
        cocoQuoteRows.push(row)
      }
    }
  } else {
    for (const amountLabel of QUOTE_INPUTS) {
      for (const direction of QUOTE_DIRECTIONS) {
        quoteMatrix.push(auditMatrixRow({ provider: 'coco', amount: amountLabel, direction, outcome: 'historical-state-unavailable', failureReason: 'reserves unavailable at fixed block' }))
      }
    }
  }

  const deadline = context.auditBlockTimestamp + 1800
  const firstQuote = cocoQuoteRows.find((item) => item.direction === 'usdc-to-eurc' && item.amount === '0.01')
  const minOutput = firstQuote?.outputRaw ? BigInt(firstQuote.outputRaw) * 99n / 100n : 1n
  const simulationInput = parseUnits('0.01', 6)
  const simulationData = encodeFunctionData({ abi: routerAbi, functionName: 'swapExactTokensForTokens', args: [simulationInput, minOutput, [usdc, eurc], SIMULATION_SENDER, BigInt(deadline)] })
  let simulationStatus: 'simulation-passed' | 'failed' = 'failed'
  let simulationFailureReason: string | undefined
  if (cocoQuoteRows.length === QUOTE_INPUTS.length * QUOTE_DIRECTIONS.length && cocoQuoteRows.every((row) => row.outcome === 'quote-succeeded')) {
    try {
      await rpc.request('eth_call', [{ from: SIMULATION_SENDER, to: router, data: simulationData, value: '0x0' }, context.auditBlockTag])
      simulationStatus = 'simulation-passed'
    } catch (error) {
      simulationFailureReason = redactSensitiveText(error instanceof Error ? error.message : String(error))
    }
  } else {
    simulationFailureReason = 'bounded quotes did not all succeed; simulation not attempted'
  }

  const xylonet = ROUTER_AUDIT_REGISTRY.find(({ id }) => id === 'xylonet')!
  const xyloRouter = xylonet.router!.address
  const xyloPool = xylonet.pools[0]!.address
  const xyloProbe = parseUnits('1', 6)
  const xyloThree = await readContract(rpc, context.auditBlockTag, xyloRouter, xyloThreeArgAbi, 'getAmountOut', [usdc, eurc, xyloProbe])
  const xyloFour = await readContract(rpc, context.auditBlockTag, xyloRouter, xyloFourArgAbi, 'getAmountOut', [xyloPool, usdc, eurc, xyloProbe])
  for (const amountLabel of QUOTE_INPUTS) {
    for (const direction of QUOTE_DIRECTIONS) {
      const tokenIn = direction === 'usdc-to-eurc' ? usdc : eurc
      const tokenOut = direction === 'usdc-to-eurc' ? eurc : usdc
      const probe = parseUnits(amountLabel, 6)
      const three = await readContract(rpc, context.auditBlockTag, xyloRouter, xyloThreeArgAbi, 'getAmountOut', [tokenIn, tokenOut, probe])
      const outcome: QuoteOutcome = three.succeeded
        ? typeof three.value === 'bigint' && three.value > 0n ? 'quote-succeeded' : 'missing-liquidity'
        : classifyCallFailure(three.failureReason)
      quoteMatrix.push(auditMatrixRow({
        provider: 'xylonet', amount: amountLabel, direction, outcome,
        outputRaw: three.succeeded && outcome === 'quote-succeeded' ? (three.value as bigint).toString() : undefined,
        failureReason: outcome === 'quote-succeeded' ? undefined : three.succeeded ? 'Quote returned zero output.' : three.failureReason,
      }))
    }
  }

  const unitflow = ROUTER_AUDIT_REGISTRY.find(({ id }) => id === 'unitflow')!
  const ufRouter = unitflow.router!.address
  for (const amountLabel of QUOTE_INPUTS) {
    for (const direction of QUOTE_DIRECTIONS) {
      const tokenIn = direction === 'usdc-to-eurc' ? usdc : eurc
      const tokenOut = direction === 'usdc-to-eurc' ? eurc : usdc
      const probe = parseUnits(amountLabel, 6)
      const call = await readContract(rpc, context.auditBlockTag, ufRouter, unitflowV25QuoteAbi, 'getAmountsOut', [probe, [tokenIn, tokenOut]])
      const amounts = call.succeeded && Array.isArray(call.value) ? (call.value as readonly bigint[]) : undefined
      const output = amounts?.[1]
      const outcome: QuoteOutcome = !call.succeeded
        ? classifyCallFailure(call.failureReason)
        : typeof output !== 'bigint'
          ? 'malformed-result'
          : output === 0n
            ? 'missing-liquidity'
            : 'quote-succeeded'
      quoteMatrix.push(auditMatrixRow({
        provider: 'unitflow', amount: amountLabel, direction, outcome,
        outputRaw: outcome === 'quote-succeeded' ? output?.toString() : undefined,
        failureReason: outcome === 'quote-succeeded'
          ? undefined
          : call.succeeded
            ? outcome === 'missing-liquidity' ? 'Quote returned zero output.' : 'Quote returned malformed output.'
            : call.failureReason,
      }))
    }
  }

  for (const amountLabel of QUOTE_INPUTS) {
    for (const direction of QUOTE_DIRECTIONS) {
      quoteMatrix.push(auditMatrixRow({ provider: 'synthra', amount: amountLabel, direction, outcome: 'authoritative-abi-unresolved', failureReason: 'No authoritative Arc deployment or active pool established; no quote attempted' }))
    }
  }

  const providerSummaries = ROUTER_AUDIT_REGISTRY.map((provider) => {
    const evidence = inspected.filter((item) => item.provider === provider.id).map((item) => item.evidence)
    const missingPrimary = [provider.factory, provider.router, ...provider.pools].filter((item): item is NonNullable<typeof item> => item !== undefined).some((primary) => evidence.find((item) => item.address === primary.address)?.codeExists === false)
    const mismatch = evidence.some((item) => item.codeHashMatched === false)
    const unresolvedProxy = evidence.some((item) => item.proxy.proxyKind === 'unknown')
    const tokenDecimalsMatched = tokenReads.every((token) => token.result.succeeded && token.result.value === token.expectedDecimals)
    const providerMatrix = quoteMatrix.filter((row) => row.provider === provider.id)
    const quotesComplete = providerMatrix.length === QUOTE_INPUTS.length * QUOTE_DIRECTIONS.length
    const quotesComparable = quotesComplete && providerMatrix.every((row) => row.quoteBlockNumber === context.auditBlockNumber && row.quoteBlockHash === context.auditBlockHash)
    const quotesSucceeded = providerMatrix.every((row) => row.outcome === 'quote-succeeded')

    const facts: PromotionFacts = {
      ...allPromotionFacts(false),
      'live-mode': true,
      'arc-chain': context.chainId === 5042002,
      'valid-addresses': true,
      'runtime-code': !missingPrimary,
      'definitive-proxy-status': !unresolvedProxy,
      'proxy-hash-pinned': provider.id === 'coco',
      'proxy-hash-matched': provider.id === 'coco' && !mismatch,
      'implementation-resolved': false,
      'implementation-hash-pinned': false,
      'implementation-hash-matched': false,
      'beacon-evidence-complete': !unresolvedProxy,
      'upgradeability-documented': !unresolvedProxy,
      'authoritative-abi': provider.id === 'coco' ? true : false,
      'authoritative-deployment': provider.id === 'coco',
      'official-conflicts-resolved': provider.id !== 'unitflow',
      'source-paths-exist': provider.id === 'coco',
      'router-factory-relationship': provider.id === 'coco' ? relationshipsMatched : false,
      'pool-factory-relationship': provider.id === 'coco' ? relationshipsMatched : false,
      'pool-token-membership': provider.id === 'coco' ? relationshipsMatched : false,
      'token-ordering': provider.id === 'coco' ? relationshipsMatched : false,
      'token-decimals': tokenDecimalsMatched,
      'allowance-target-verified': false,
      'execution-target-verified': false,
      'bounded-quote-matrix-complete': quotesComplete,
      'quote-block-comparable': quotesComparable,
      'quote-outputs-valid': quotesSucceeded,
      'reserve-bounds': false,
      'quote-freshness': quotesComparable,
      'exact-calldata': provider.id === 'coco' && simulationStatus === 'simulation-passed',
      'recipient-explicit': provider.id === 'coco' && simulationStatus === 'simulation-passed',
      'deadline-verified': provider.id === 'coco' && simulationStatus === 'simulation-passed',
      'min-output-verified': provider.id === 'coco' && simulationStatus === 'simulation-passed',
      'no-unexpected-value': provider.id === 'coco' && simulationStatus === 'simulation-passed',
      'wrapping-resolved': provider.id !== 'unitflow',
      'simulation-passed': provider.id === 'coco' && simulationStatus === 'simulation-passed',
      'sender-assumptions-documented': true,
      'no-arbitrary-call': provider.id !== 'unitflow',
      'no-unknown-mandatory-fields': provider.id === 'coco' && !unresolvedProxy && relationshipsMatched && tokenDecimalsMatched,
      'no-skipped-checks': provider.id === 'coco' && quotesSucceeded,
    }
    const promotion: PromotionGateResult = evaluateExecutablePromotion(facts)
    const candidateTargets = buildCandidateTargets(provider.router?.address, provider.router?.address)
    let executableTargets: ExecutableTargets | undefined
    if (promotion.eligible) {
      executableTargets = executableTargetsSchema.parse({ allowanceTarget: candidateTargets.allowanceTarget!, executionTarget: candidateTargets.executionTarget! })
    }
    assertExecutableTargetsConsistency({ status: promotion.status, executableTargets })

    const status = promotion.eligible ? 'verified-executable' : provider.status
    const disableReason = promotion.eligible
      ? undefined
      : provider.id === 'coco'
        ? (relationshipsMatched && quotesComplete && !quotesSucceeded
            ? 'Canonical code hashes and relationships matched, but the pair had no usable liquidity for bounded quotes at the audit block.'
            : 'Canonical verification incomplete at the fixed audit block.')
        : provider.disableReason

    return {
      provider: provider.id,
      registryStatus: provider.status,
      status,
      executable: promotion.eligible,
      candidateTargets,
      executableTargets,
      evidence,
      promotion,
      disableReason,
    }
  })

  return {
    schemaVersion: 1,
    mode: 'live' as const,
    fixture: false,
    networkAccess: true,
    auditDate: new Date().toISOString(),
    ...context,
    noBroadcastStatement: 'No transaction was broadcast, signed, approved, or submitted. Only allowlisted JSON-RPC reads, eth_call, and eth_estimateGas are permitted.',
    limitations: [
      'A simulation passed result proves only non-reversion under the selected block and sender assumptions; it does not prove safety, audit status, future success, inclusion, price safety, or liquidity.',
      'External candidates remain non-executable until authoritative source/ABI/proxy/pool/allowance/execution evidence is complete.',
      'Earlier live audit blocks (for example 52,479,262) are diagnostic history only and are not presented as final evidence.',
    ],
    tokens: tokenReads,
    providers: providerSummaries,
    quoteMatrix,
    coco: { relationshipsMatched, reserves: reservesResult, quotes: cocoQuoteRows, simulation: { status: simulationStatus, failureReason: simulationFailureReason }, pairInitCodeHash: deployment.pairInitCodeHash },
    xylonet: { abiConflict: { operatorSuppliedThreeArgument: xyloThree, operatorSuppliedFourArgument: xyloFour, resolution: 'Operator-supplied 3-arg and 4-arg ABIs conflict and remain unresolved; neither is accepted for execution by this PR.' } },
    unitflow: { officialInventoryPreserved: true, wusdc: 'verification incomplete', universalRouter: 'disabled; no command bytes generated' },
    synthra: { outcome: 'authoritative Arc deployment relationship not established by registry evidence; no placeholder quote produced' },
  }
}

export async function bootstrapLiveAudit(rpcUrl: string, providerLabel = 'operator-supplied Arc RPC') {
  return runLiveAudit(rpcUrl, providerLabel)
}

export type LiveAuditReport = Awaited<ReturnType<typeof runLiveAudit>>
export type { AuditContext }
export { ADDRESS_ZERO }
