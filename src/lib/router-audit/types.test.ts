import { describe, expect, it } from 'vitest'
import { ARC_TESTNET_CHAIN_ID, providerEntrySchema, routerRegistrySchema } from './types'

const source = {
  kind: 'official-documentation' as const,
  reference: 'https://example.invalid/provider',
  weight: 'secondary' as const,
}

const token = (symbol: 'USDC' | 'EURC', address: `0x${string}`) => ({
  symbol,
  address,
  decimals: 6,
  applicationAmountUnit: 'erc20-6-decimal' as const,
})

const base = {
  id: 'xylonet' as const,
  displayName: 'XyloNet',
  chainId: ARC_TESTNET_CHAIN_ID,
  protocolType: 'xylo-stable' as const,
  status: 'unverified' as const,
  pools: [],
  inventoryCandidates: [],
  conflictingCandidates: [],
  supportedTokens: [
    token('USDC', '0x3600000000000000000000000000000000000000'),
    token('EURC', '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a'),
  ],
  supportedPairs: [['USDC', 'EURC']] as const,
  quoteDirections: ['usdc-to-eurc', 'eurc-to-usdc'] as const,
  executionDirections: [] as const,
  poolDiscoveryMethod: 'candidate pool requires fixed-block verification',
  abiProvenance: [source],
  documentationProvenance: [source],
  sourceCodeProvenance: [],
  upgradeability: { proxyKind: 'unknown' as const, mutable: true, requiresReauditOnUpgrade: true },
  evidenceSources: [source],
  disableReason: 'Mandatory runtime verification is incomplete.',
}

const contract = (label: string, address: `0x${string}`) => ({
  label,
  address,
  role: 'router' as const,
  provenance: [source],
})

describe('router audit registry schema', () => {
  it('accepts a complete non-executable discovery entry', () => {
    expect(providerEntrySchema.parse(base).status).toBe('unverified')
  })

  it('rejects unsupported chain IDs and invalid addresses', () => {
    expect(() => providerEntrySchema.parse({ ...base, chainId: 1 })).toThrow()
    expect(() => providerEntrySchema.parse({ ...base, router: contract('router', '0x123') })).toThrow()
  })

  it('rejects duplicate provider IDs and duplicate contract addresses', () => {
    const router = contract('router', '0x73742278c31a76dBb0D2587d03ef92E6E2141023')
    const first = { ...base, router }
    expect(() => routerRegistrySchema.parse([first, { ...first }])).toThrow(/duplicate provider id|duplicate contract address/)

    const second = { ...base, id: 'synthra' as const, displayName: 'Synthra', router }
    expect(() => routerRegistrySchema.parse([first, second])).toThrow(/duplicate contract address/)
  })

  it('rejects executable providers missing mandatory verification fields', () => {
    expect(() => providerEntrySchema.parse({ ...base, status: 'verified-executable', disableReason: undefined })).toThrow(
      /verified-executable provider requires/,
    )
  })

  it('rejects quote-only providers that expose approval or execution targets', () => {
    const target = '0x73742278c31a76dBb0D2587d03ef92E6E2141023'
    expect(() => providerEntrySchema.parse({ ...base, status: 'verified-quote-only', allowanceTarget: target })).toThrow(
      /quote-only provider must not expose/,
    )
    expect(() => providerEntrySchema.parse({ ...base, status: 'verified-quote-only', executionTarget: target })).toThrow(
      /quote-only provider must not expose/,
    )
  })

  it('requires disabled, unavailable, and unverified providers to explain why execution is disabled', () => {
    expect(() => providerEntrySchema.parse({ ...base, disableReason: undefined })).toThrow(/disable reason/)
  })
})
