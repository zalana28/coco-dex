import { describe, expect, it, vi } from 'vitest'
import { ArcTestnet, BaseSepolia, EthereumSepolia, TransferSpeed, type BridgeResult, type EstimateResult } from '@circle-fin/bridge-kit'
import { ARC_ROUTE, SOURCE_ROUTES, asCctpDomain, asEvmChainId } from './chains'
import { formatUsdc, parseUsdc } from './amounts'
import { normalizeBridgeResult } from './result'
import { normalizeEstimate } from './estimate'
import { classifyBridgeError } from './errors'
import { BridgeRecoverySchema, assertRecoveryBindings, createRecoveryRecord, memoryStorage, recoveryStore } from './recovery'
import { createBridgeFacade } from './facade'

const address = '0x1111111111111111111111111111111111111111'
const recipient = '0x2222222222222222222222222222222222222222'

function result(steps: BridgeResult['steps']): BridgeResult {
  return { amount: '10', token: 'USDC', state: 'pending', provider: 'CCTPV2BridgingProvider', source: { address, chain: EthereumSepolia }, destination: { address: recipient, recipientAddress: recipient, useForwarder: true, chain: ArcTestnet }, steps }
}

describe('CCTP route and amount invariants', () => {
  it('only exposes Sepolia sources into Arc CCTPv2 domain 26', () => {
    expect(SOURCE_ROUTES.map((route) => route.chain)).toEqual(['Ethereum_Sepolia', 'Base_Sepolia'])
    expect(ARC_ROUTE).toMatchObject({ chain: 'Arc_Testnet', chainId: 5042002, domain: 26 })
    expect(() => asEvmChainId(0)).toThrow()
    expect(() => asCctpDomain(-1)).toThrow()
  })

  it('converts human USDC exactly at six decimals without ether helpers', () => {
    expect(parseUsdc('1.000001')).toBe(1_000_001n)
    expect(formatUsdc(1_000_001n)).toBe('1.000001')
    expect(() => parseUsdc('1.0000001')).toThrow()
    expect(() => parseUsdc('-1')).toThrow()
  })
})

describe('result and estimate normalization', () => {
  it('normalizes SDK lifecycle and preserves only SDK explorer URLs', () => {
    const normalized = normalizeBridgeResult(result([
      { name: 'approve', state: 'success', txHash: '0xaa', explorerUrl: 'https://sdk/approve' },
      { name: 'burn', state: 'success', txHash: '0xbb', explorerUrl: 'https://sdk/burn' },
      { name: 'fetchAttestation', state: 'pending' },
      { name: 'mint', state: 'error', errorCategory: 'polling_timeout', errorMessage: 'timeout' },
    ]))
    expect(normalized.steps.map((step) => step.state)).toEqual(['success', 'success', 'pending', 'recoverable'])
    expect(normalized.steps[1]?.explorerUrl).toBe('https://sdk/burn')
  })

  it('fills absent lifecycle steps and marks the next wallet step', () => {
    expect(normalizeBridgeResult(result([])).steps.map((step) => step.state)).toEqual(['waiting-wallet', 'idle', 'idle', 'idle'])
  })

  it('keeps provider, forwarder and kit fees separate and subtracts decimals exactly', () => {
    const estimate: EstimateResult = {
      token: 'USDC', amount: '10', source: { address, chain: EthereumSepolia.chain }, destination: { address: recipient, chain: ArcTestnet.chain },
      fees: [{ type: 'provider', token: 'USDC', amount: '0.000001' }, { type: 'forwarder', token: 'USDC', amount: '0.1' }, { type: 'kit', token: 'USDC', amount: null }],
      gasFees: [{ name: 'burn', token: 'ETH', blockchain: EthereumSepolia.chain, fees: { gas: 1n, gasPrice: 2n, fee: '2' } }],
    }
    expect(normalizeEstimate(estimate, 'SLOW')).toMatchObject({ providerFee: '0.000001', forwarderFee: '0.1', kitFee: null, totalFee: '0.100001', destinationAmount: '9.899999' })
    expect(normalizeEstimate(estimate, 'SLOW').gas).toHaveLength(1)
  })

  it('treats an absent provider fee as zero for Standard/SLOW and never throws', () => {
    const estimate: EstimateResult = {
      token: 'USDC', amount: '10', source: { address, chain: EthereumSepolia.chain }, destination: { address: recipient, chain: ArcTestnet.chain },
      fees: [{ type: 'provider', token: 'USDC', amount: null }, { type: 'forwarder', token: 'USDC', amount: '0.05' }],
      gasFees: [{ name: 'burn', token: 'ETH', blockchain: EthereumSepolia.chain, fees: { gas: 1n, gasPrice: 2n, fee: '2' } }],
    }
    const normalized = normalizeEstimate(estimate, 'SLOW')
    expect(normalized.providerFee).toBe('0')
    expect(normalized.totalFee).toBe('0.05')
    expect(normalized.destinationAmount).toBe('9.95')
    expect(normalized.warnings).toContain('CCTP protocol fee: 0 USDC — Standard transfer')
  })

  it('blocks Fast when the provider (CCTP protocol) fee cannot be estimated', () => {
    const estimate: EstimateResult = {
      token: 'USDC', amount: '10', source: { address, chain: EthereumSepolia.chain }, destination: { address: recipient, chain: ArcTestnet.chain },
      fees: [{ type: 'provider', token: 'USDC', amount: null }, { type: 'forwarder', token: 'USDC', amount: '0.1' }],
      gasFees: [{ name: 'burn', token: 'ETH', blockchain: EthereumSepolia.chain, fees: { gas: 1n, gasPrice: 2n, fee: '2' } }],
    }
    expect(() => normalizeEstimate(estimate, 'FAST')).toThrow('CCTP protocol fee estimate is unavailable')
  })

  it('parses fees by type, never by array position', () => {
    const estimate: EstimateResult = {
      token: 'USDC', amount: '10', source: { address, chain: EthereumSepolia.chain }, destination: { address: recipient, chain: ArcTestnet.chain },
      fees: [{ type: 'forwarder', token: 'USDC', amount: '0.2' }, { type: 'kit', token: 'USDC', amount: '0.01' }, { type: 'provider', token: 'USDC', amount: '0.000003' }],
      gasFees: [{ name: 'burn', token: 'ETH', blockchain: EthereumSepolia.chain, fees: { gas: 1n, gasPrice: 2n, fee: '2' } }],
    }
    const normalized = normalizeEstimate(estimate, 'SLOW')
    expect(normalized.providerFee).toBe('0.000003')
    expect(normalized.forwarderFee).toBe('0.2')
    expect(normalized.kitFee).toBe('0.01')
    expect(normalized.totalFee).toBe('0.210003')
  })

  it('fails closed when forwarding or source gas cannot be estimated', () => {
    const estimate: EstimateResult = {
      token: 'USDC', amount: '1', source: { address, chain: EthereumSepolia.chain }, destination: { address: recipient, chain: ArcTestnet.chain },
      fees: [{ type: 'provider', token: 'USDC', amount: '0.01' }, { type: 'forwarder', token: 'USDC', amount: null }],
      gasFees: [{ name: 'burn', token: 'ETH', blockchain: EthereumSepolia.chain, fees: null }],
    }
    expect(() => normalizeEstimate(estimate, 'SLOW')).toThrow('Forwarding Service fee estimate is unavailable')
  })
})

describe('recovery and errors', () => {
  it('strictly rejects non-JSON, unknown and mismatched recovery records', () => {
    const record = createRecoveryRecord({ wallet: address, source: 'Ethereum_Sepolia', recipient, amount: '10', mode: 'FAST', result: result([{ name: 'burn', state: 'success', txHash: '0xbb' }]), traceId: '0123456789abcdef0123456789abcdef' })
    expect(BridgeRecoverySchema.parse(JSON.parse(JSON.stringify(record))).burnHash).toBe('0xbb')
    expect(BridgeRecoverySchema.safeParse({ ...record, adapter: {} }).success).toBe(false)
    expect(() => assertRecoveryBindings(record, { wallet: recipient, source: 'Ethereum_Sepolia', recipient })).toThrow()
  })

  it('persists immediately once a successful burn is observed', () => {
    const storage = memoryStorage()
    const store = recoveryStore(storage)
    const record = createRecoveryRecord({ wallet: address, source: 'Ethereum_Sepolia', recipient, amount: '10', mode: 'FAST', result: result([{ name: 'burn', state: 'success', txHash: '0xbb' }]), traceId: '0123456789abcdef0123456789abcdef' })
    store.saveAfterBurn(record)
    expect(store.load()?.burnHash).toBe('0xbb')
  })

  it('redacts secrets and classifies retryability', () => {
    expect(classifyBridgeError(new Error('RPC failed https://rpc/?apiKey=secret 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'))).toMatchObject({ category: 'network', recoverable: true })
    expect(classifyBridgeError({ code: 4001, message: 'denied' })).toMatchObject({ category: 'user-rejected', recoverable: false })
  })
})

describe('facade', () => {
  it('uses forwarding-only params, disables batching, and retryBridge calls retry with a fresh adapter', async () => {
    const adapter1 = { id: 1 }
    const adapter2 = { id: 2 }
    const adapter3 = { id: 3 }
    const makeAdapter = vi.fn().mockResolvedValueOnce(adapter1).mockResolvedValueOnce(adapter2).mockResolvedValueOnce(adapter3)
    const onBurn = vi.fn()
    const kit = { estimate: vi.fn().mockResolvedValue({}), bridge: vi.fn().mockResolvedValue(result([])), retry: vi.fn().mockResolvedValue(result([])), on: vi.fn((name, handler) => { if (name === 'burn') handler({ values: { name: 'burn', state: 'success', txHash: '0xbb' } }) }), off: vi.fn() }
    const facade = createBridgeFacade({ kit: kit as never, createAdapter: makeAdapter as never })
    const input = { provider: { request: vi.fn() } as never, wallet: address, source: 'Base_Sepolia' as const, recipient, amount: '1', mode: TransferSpeed.SLOW, traceId: '0123456789abcdef0123456789abcdef', onBurn }
    await facade.estimate(input)
    await facade.bridge(input)
    await facade.retryBridge(result([{ name: 'burn', state: 'success', txHash: '0xbb' }]), input)
    expect(kit.bridge).toHaveBeenCalledWith(expect.objectContaining({ from: { adapter: adapter2, chain: 'Base_Sepolia' }, to: { adapter: adapter2, chain: 'Arc_Testnet', recipientAddress: recipient, useForwarder: true }, token: 'USDC', config: { transferSpeed: 'SLOW', batchTransactions: false } }))
    expect(kit.retry).toHaveBeenCalledWith(expect.anything(), { from: adapter3, to: undefined }, { traceId: input.traceId })
    expect(kit.bridge).toHaveBeenCalledTimes(1)
    expect(makeAdapter).toHaveBeenCalledTimes(3)
    expect(onBurn).toHaveBeenCalledWith(expect.objectContaining({ steps: [{ name: 'burn', state: 'success', txHash: '0xbb' }] }))
    expect(kit.off).toHaveBeenCalledWith('burn', expect.any(Function))
  })
})

void BaseSepolia
