import { decodeAbiParameters, formatUnits, keccak256, type Hex } from 'viem'
import { ARC_TESTNET_CHAIN_ID, type Upgradeability } from './types'
import {
  detectProxyPattern,
  EIP1967_ADMIN_SLOT_CANONICAL,
  EIP1967_ADMIN_SLOT_SUPPLIED,
  EIP1967_BEACON_SLOT,
  EIP1967_IMPLEMENTATION_SLOT,
  parseAddressFromStorage,
  type ProxyResolution,
} from './proxy'
import { redactSensitiveText } from './safeError'

export type RpcReader = {
  providerLabel: string
  request(method: string, params: readonly unknown[]): Promise<unknown>
}

export type AuditContext = {
  chainId: number
  auditBlockNumber: number
  auditBlockTag: `0x${string}`
  auditBlockHash: `0x${string}`
  auditBlockTimestamp: number
  rpcProviderLabel: string
  rpcCapabilityLimitations: string[]
}

function hexNumber(value: unknown, label: string): number {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/.test(value)) throw new Error(`malformed ${label}`)
  return Number(BigInt(value))
}

export async function createAuditContext(rpc: RpcReader): Promise<AuditContext> {
  const chainId = hexNumber(await rpc.request('eth_chainId', []), 'chain id')
  if (chainId !== ARC_TESTNET_CHAIN_ID) throw new Error(`expected Arc Testnet chain ID ${ARC_TESTNET_CHAIN_ID}, received ${chainId}`)
  const auditBlockTag = (await rpc.request('eth_blockNumber', [])) as `0x${string}`
  const auditBlockNumber = hexNumber(auditBlockTag, 'block number')
  const block = (await rpc.request('eth_getBlockByNumber', [auditBlockTag, false])) as {
    number?: string
    hash?: string
    timestamp?: string
  } | null
  if (!block?.number || hexNumber(block.number, 'returned block number') !== auditBlockNumber) throw new Error('block number mismatch')
  if (!block.hash || !/^0x[0-9a-fA-F]{64}$/.test(block.hash)) throw new Error('block hash mismatch or missing')
  return {
    chainId,
    auditBlockNumber,
    auditBlockTag,
    auditBlockHash: block.hash.toLowerCase() as `0x${string}`,
    auditBlockTimestamp: hexNumber(block.timestamp, 'block timestamp'),
    rpcProviderLabel: rpc.providerLabel,
    rpcCapabilityLimitations: [],
  }
}

function safeSlot(reader: RpcReader, address: string, slot: string, blockTag: string): Promise<`0x${string}` | undefined> {
  return (async () => {
    try {
      const raw = (await reader.request('eth_getStorageAt', [address, slot, blockTag])) as string
      return parseAddressFromStorage(raw)
    } catch {
      return undefined
    }
  })()
}

function codeHash(reader: RpcReader, address: string, blockTag: string): Promise<`0x${string}` | undefined> {
  return (async () => {
    try {
      const code = (await reader.request('eth_getCode', [address, blockTag])) as Hex
      if (!code || code === '0x') return undefined
      return keccak256(code)
    } catch {
      return undefined
    }
  })()
}

export async function resolveProxy(
  reader: RpcReader,
  proxyAddress: `0x${string}`,
  runtimeCode: string,
  blockTag: `0x${string}`,
): Promise<ProxyResolution> {
  const failures: string[] = []
  const watched: RpcReader = {
    providerLabel: reader.providerLabel,
    async request(method, params) {
      try {
        return await reader.request(method, params)
      } catch (error) {
        failures.push(redactSensitiveText(error instanceof Error ? error.message : String(error)))
        throw error
      }
    },
  }
  let implementation: `0x${string}` | undefined
  let beacon: `0x${string}` | undefined
  let canonicalAdmin: `0x${string}` | undefined
  let suppliedAdmin: `0x${string}` | undefined
  try {
    ;[implementation, beacon, canonicalAdmin, suppliedAdmin] = await Promise.all([
      safeSlot(watched, proxyAddress, EIP1967_IMPLEMENTATION_SLOT, blockTag),
      safeSlot(watched, proxyAddress, EIP1967_BEACON_SLOT, blockTag),
      safeSlot(watched, proxyAddress, EIP1967_ADMIN_SLOT_CANONICAL, blockTag),
      safeSlot(watched, proxyAddress, EIP1967_ADMIN_SLOT_SUPPLIED, blockTag),
    ])
  } catch (error) {
    failures.push(redactSensitiveText(error instanceof Error ? error.message : String(error)))
  }
  const pattern = runtimeCode === '0x' ? { kind: 'none' as const } : detectProxyPattern(runtimeCode)
  const divergence = canonicalAdmin !== suppliedAdmin ? 'admin slot divergence between canonical and supplied slot' : undefined
  if (divergence) failures.push(divergence)
  if (failures.length) {
    return {
      status: 'unknown',
      mutable: true,
      readsFailed: true,
      storageReadFailures: failures,
      slotDivergence: divergence,
      warning: 'Storage reads failed or diverged; proxy state unresolved.',
    }
  }
  if (implementation && beacon) {
    return {
      status: 'unknown',
      implementationAddress: implementation,
      beaconAddress: beacon,
      mutable: true,
      readsFailed: false,
      warning: 'Implementation and beacon slots are both populated; proxy state is ambiguous.',
    }
  }
  if (runtimeCode === '0x') {
    return { status: 'unknown', mutable: true, readsFailed: false, warning: 'Candidate runtime bytecode is empty; proxy state is unresolved.' }
  }

  if (implementation) {
    const implHash = await codeHash(reader, implementation, blockTag)
    if (!implHash) return { status: 'unknown', implementationAddress: implementation, mutable: true, readsFailed: true, storageReadFailures: [...failures, 'implementation code missing at block'], warning: 'Implementation slot set but runtime code is empty.' }
    let proxyKind: ProxyResolution['status'] = 'eip1967-implementation'
    let isUups = false
    if (!canonicalAdmin && !suppliedAdmin) {
      try {
        const uuid = await reader.request('eth_call', [{ to: implementation, data: '0x52d1902d' }, blockTag])
        isUups = typeof uuid === 'string' && uuid.toLowerCase() === EIP1967_IMPLEMENTATION_SLOT
      } catch { isUups = false }
    }
    if (isUups) proxyKind = 'eip1967-implementation'
    return {
      status: proxyKind,
      implementationAddress: implementation,
      implementationRuntimeCodeHash: implHash,
      proxyAdminAddress: canonicalAdmin ?? suppliedAdmin,
      mutable: true,
      readsFailed: failures.length > 0,
      storageReadFailures: failures.length ? failures : undefined,
      warning: 'Mutable implementation: pin the implementation hash and re-audit after every upgrade.',
    }
  }
  if (beacon) {
    const beaconHash = await codeHash(reader, beacon, blockTag)
    if (!beaconHash) return { status: 'unknown', beaconAddress: beacon, mutable: true, readsFailed: true, storageReadFailures: [...failures, 'beacon code missing at block'], warning: 'Beacon slot set but beacon code is empty.' }
    try {
      const raw = (await reader.request('eth_call', [{ to: beacon, data: '0x5c60da1b' }, blockTag])) as Hex
      const [beaconImplementation] = decodeAbiParameters([{ type: 'address' }], raw)
      if (!beaconImplementation || /^0x0{40}$/.test(beaconImplementation)) {
        return { status: 'unknown', beaconAddress: beacon, mutable: true, readsFailed: failures.length > 0, storageReadFailures: [...failures, 'beacon returned empty implementation'], warning: 'Beacon returned an empty implementation address; proxy state unresolved.' }
      }
      const beaconImplementationHash = await codeHash(reader, beaconImplementation, blockTag)
      if (!beaconImplementationHash) {
        return {
          status: 'unknown',
          beaconAddress: beacon,
          beaconImplementationAddress: beaconImplementation.toLowerCase() as `0x${string}`,
          mutable: true,
          readsFailed: true,
          storageReadFailures: ['beacon implementation code missing at block'],
          warning: 'Beacon implementation has no runtime code; proxy state unresolved.',
        }
      }
      return {
        status: 'eip1967-beacon',
        beaconAddress: beacon,
        beaconImplementationAddress: beaconImplementation.toLowerCase() as `0x${string}`,
        implementationRuntimeCodeHash: beaconImplementationHash,
        mutable: true,
        readsFailed: failures.length > 0,
        storageReadFailures: failures.length ? failures : undefined,
        warning: 'Mutable beacon implementation: pin both beacon and implementation evidence and re-audit after every upgrade.',
      }
    } catch (error) {
      return { status: 'unknown', beaconAddress: beacon, mutable: true, readsFailed: true, storageReadFailures: [...failures, redactSensitiveText(error instanceof Error ? error.message : String(error))], warning: 'Beacon implementation call failed; proxy state unresolved.' }
    }
  }
  if (pattern.kind === 'eip1167-minimal' && pattern.implementationAddress) {
    const implHash = await codeHash(reader, pattern.implementationAddress, blockTag)
    if (!implHash) return { status: 'unknown', implementationAddress: pattern.implementationAddress, mutable: false, readsFailed: true, storageReadFailures: [...failures, 'eip1167 implementation code missing at block'], warning: 'EIP-1167 target has no runtime code.' }
    return { status: 'eip1167-minimal', implementationAddress: pattern.implementationAddress, implementationRuntimeCodeHash: implHash, mutable: false, readsFailed: failures.length > 0, storageReadFailures: failures.length ? failures : undefined }
  }
  if (pattern.kind === 'delegatecall-forwarder') {
    if (failures.length) return { status: 'unknown', mutable: true, readsFailed: true, storageReadFailures: failures, slotDivergence: divergence, warning: 'Storage reads failed; proxy state unresolved.' }
    return { status: 'proxy-pattern-other', mutable: true, readsFailed: false, storageReadFailures: failures.length ? failures : undefined, warning: 'Compact delegatecall forwarder with no EIP-1967 slot; treat as proxy.' }
  }
  if (failures.length) return { status: 'unknown', mutable: true, readsFailed: true, storageReadFailures: failures, slotDivergence: divergence, warning: 'Storage reads failed; proxy state unresolved.' }
  return { status: 'unknown', mutable: true, readsFailed: false, warning: 'No recognized proxy pattern or EIP-1967 slot was found; non-proxy status is not proven.' }
}

export function toUpgradeability(resolution: ProxyResolution): Upgradeability {
  return {
    proxyKind: resolution.status === 'non-proxy-confirmed'
      ? 'none'
      : resolution.status === 'eip1967-implementation'
        ? 'eip1967'
        : resolution.status === 'eip1967-beacon'
          ? 'eip1967-beacon'
          : resolution.status === 'eip1167-minimal'
            ? 'eip1167'
            : resolution.status === 'proxy-pattern-other'
              ? 'delegatecall-forwarder'
              : 'unknown',
    implementationAddress: resolution.implementationAddress,
    implementationRuntimeCodeHash: resolution.implementationRuntimeCodeHash,
    beaconAddress: resolution.beaconAddress,
    beaconImplementationAddress: resolution.beaconImplementationAddress,
    proxyAdmin: resolution.proxyAdminAddress,
    mutable: resolution.mutable,
    requiresReauditOnUpgrade: resolution.mutable,
    warning: resolution.warning,
  }
}

export type NormalizedQuote = {
  provider: string
  verificationStatus: string
  chainId: number
  auditBlockNumber: number
  auditBlockHash: string
  auditBlockTimestamp: number
  inputToken: string
  inputTokenAddress: string
  inputRaw: string
  inputHuman: string
  outputToken: string
  outputTokenAddress: string
  outputRaw: string
  outputHuman: string
  quoteBlockNumber: number
  quoteTimestamp: number
  estimatedGasUnits: string
  estimatedNativeGasRaw: string
  estimatedNativeGasFormatted: string
  formattedGasCostUsdc?: string
  gasConversionSource?: string
  simulationStatus: 'not-run' | 'simulation-passed' | 'failed'
  failureReason?: string
}

export function normalizeQuote(input: {
  provider: string; blockNumber: number; blockHash: string; blockTimestamp: number
  inputToken: string; inputTokenAddress: string; inputRaw: bigint
  outputToken: string; outputTokenAddress: string; outputRaw: bigint
  estimatedGasUnits: bigint; gasPriceWei: bigint
}): NormalizedQuote {
  const nativeGas = input.estimatedGasUnits * input.gasPriceWei
  return {
    provider: input.provider, verificationStatus: 'verification incomplete', chainId: ARC_TESTNET_CHAIN_ID,
    auditBlockNumber: input.blockNumber, auditBlockHash: input.blockHash, auditBlockTimestamp: input.blockTimestamp,
    inputToken: input.inputToken, inputTokenAddress: input.inputTokenAddress, inputRaw: input.inputRaw.toString(), inputHuman: formatUnits(input.inputRaw, 6),
    outputToken: input.outputToken, outputTokenAddress: input.outputTokenAddress, outputRaw: input.outputRaw.toString(), outputHuman: formatUnits(input.outputRaw, 6),
    quoteBlockNumber: input.blockNumber, quoteTimestamp: input.blockTimestamp,
    estimatedGasUnits: input.estimatedGasUnits.toString(), estimatedNativeGasRaw: nativeGas.toString(), estimatedNativeGasFormatted: formatUnits(nativeGas, 18),
    simulationStatus: 'not-run',
  }
}

export function validateNormalizedQuote(
  quote: NormalizedQuote,
  options: { auditBlockNumber?: number; expectedDirection?: 'usdc-to-eurc' | 'eurc-to-usdc'; reserveOut?: bigint } = {},
): string[] {
  const failures: string[] = []
  const output = BigInt(quote.outputRaw)
  if (output === 0n) failures.push('zero output')
  if (output < 0n) failures.push('negative output')
  if (options.auditBlockNumber !== undefined && quote.quoteBlockNumber !== options.auditBlockNumber) failures.push('stale quote')
  const actual = `${quote.inputToken.toLowerCase()}-to-${quote.outputToken.toLowerCase()}`
  if (options.expectedDirection && actual !== options.expectedDirection) failures.push('unsupported token direction')
  if (options.reserveOut !== undefined && output >= options.reserveOut) failures.push('quote beyond sane reserve bounds')
  return failures
}

export function assertComparableResults(results: readonly { quoteBlockNumber: number; auditBlockHash: string }[]): void {
  if (results.length < 2) return
  const first = results[0]!
  if (results.some((result) => result.quoteBlockNumber !== first.quoteBlockNumber || result.auditBlockHash !== first.auditBlockHash)) {
    throw new Error('provider results are non-comparable because block number or block hash differs')
  }
}
