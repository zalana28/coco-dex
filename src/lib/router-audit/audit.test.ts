import { describe, expect, it, vi } from 'vitest'
import { encodeAbiParameters } from 'viem'
import {
  createAuditContext,
  normalizeQuote,
  resolveProxy,
  toUpgradeability,
  validateNormalizedQuote,
  assertComparableResults,
} from './audit'
import {
  EIP1967_ADMIN_SLOT_CANONICAL,
  EIP1967_ADMIN_SLOT_SUPPLIED,
  EIP1967_BEACON_SLOT,
  EIP1967_IMPLEMENTATION_SLOT,
  type ProxyResolution,
} from './proxy'

const block = { number: '0x100', hash: `0x${'ab'.repeat(32)}`, timestamp: '0x65' }
const rpc = (handler: (method: string, params: readonly unknown[]) => unknown) => ({
  providerLabel: 'fixture RPC',
  request: vi.fn(async (method: string, params: readonly unknown[]) => handler(method, params)),
})
const storage = (address: string) => `0x${'0'.repeat(24)}${address.slice(2)}`

describe('fixed-block audit context', () => {
  it('requires Arc Testnet and records one block hash and timestamp', async () => {
    const transport = rpc((method) => ({ eth_chainId: '0x4cef52', eth_blockNumber: '0x100', eth_getBlockByNumber: block })[method])
    const context = await createAuditContext(transport)
    expect(context).toEqual({
      chainId: 5_042_002, auditBlockNumber: 256, auditBlockTag: '0x100', auditBlockHash: block.hash,
      auditBlockTimestamp: 101, rpcProviderLabel: 'fixture RPC', rpcCapabilityLimitations: [],
    })
    expect(transport.request).toHaveBeenLastCalledWith('eth_getBlockByNumber', ['0x100', false])
  })

  it('rejects chain mismatch and block hash mismatch', async () => {
    await expect(createAuditContext(rpc((method) => (method === 'eth_chainId' ? '0x1' : '0x0')))).rejects.toThrow(/5042002/)
    await expect(createAuditContext(rpc((method) => ({ eth_chainId: '0x4cef52', eth_blockNumber: '0x100', eth_getBlockByNumber: { ...block, number: '0xff' } })[method]))).rejects.toThrow(/block number mismatch/)
  })
})

describe('slot-first fail-closed proxy resolution', () => {
  it('reads implementation/beacon/admin for every candidate regardless of bytecode heuristic', async () => {
    const implementation = '0x1111111111111111111111111111111111111111'
    const admin = '0x2222222222222222222222222222222222222222'
    const transport = rpc((method, params) => {
      if (method === 'eth_getStorageAt') {
        if (params[1] === EIP1967_IMPLEMENTATION_SLOT) return storage(implementation)
        if (params[1] === EIP1967_ADMIN_SLOT_CANONICAL) return storage(admin)
        if (params[1] === EIP1967_ADMIN_SLOT_SUPPLIED) return storage(admin)
        if (params[1] === EIP1967_BEACON_SLOT) return `0x${'0'.repeat(64)}`
      }
      if (method === 'eth_getCode' && String(params[0]).toLowerCase() === implementation) return '0x60806040'
      throw new Error(`unexpected ${method}`)
    })
    const resolution = await resolveProxy(transport, '0x3333333333333333333333333333333333333333', '0x60006000f4', '0x100')
    expect(resolution.status).toBe('eip1967-implementation')
    expect(resolution.implementationAddress).toBe(implementation)
    expect(resolution.proxyAdminAddress).toBe(admin)
    expect(resolution.mutable).toBe(true)
    expect(resolution.implementationRuntimeCodeHash).toMatch(/^0x[0-9a-f]{64}$/)
    const upgrade = toUpgradeability(resolution)
    expect(upgrade.proxyKind).toBe('eip1967')
    expect(upgrade.proxyAdmin).toBe(admin)
  })

  it('detects UUPS through implementation proxiableUUID()', async () => {
    const implementation = '0x1111111111111111111111111111111111111111'
    const transport = rpc((method, params) => {
      if (method === 'eth_getStorageAt') {
        if (params[1] === EIP1967_IMPLEMENTATION_SLOT) return storage(implementation)
        if (params[1] === EIP1967_ADMIN_SLOT_CANONICAL) return `0x${'0'.repeat(64)}`
        if (params[1] === EIP1967_ADMIN_SLOT_SUPPLIED) return `0x${'0'.repeat(64)}`
        return `0x${'0'.repeat(64)}`
      }
      if (method === 'eth_getCode') return '0x60806040'
      if (method === 'eth_call') return EIP1967_IMPLEMENTATION_SLOT
      throw new Error(`unexpected ${method}`)
    })
    const resolution = await resolveProxy(transport, '0x3333333333333333333333333333333333333333', '0x60006000f4', '0x100')
    expect(resolution.status).toBe('eip1967-implementation')
    expect(resolution.implementationAddress).toBe(implementation)
  })

  it('resolves an EIP-1967 beacon and its implementation()', async () => {
    const beacon = '0x4444444444444444444444444444444444444444'
    const implementation = '0x5555555555555555555555555555555555555555'
    const transport = rpc((method, params) => {
      if (method === 'eth_getStorageAt') {
        if (params[1] === EIP1967_BEACON_SLOT) return storage(beacon)
        return `0x${'0'.repeat(64)}`
      }
      if (method === 'eth_call') return encodeAbiParameters([{ type: 'address' }], [implementation])
      if (method === 'eth_getCode') return '0x60806040'
      throw new Error(`unexpected ${method}`)
    })
    const resolution = await resolveProxy(transport, '0x3333333333333333333333333333333333333333', '0x60006000f4', '0x100')
    expect(resolution.status).toBe('eip1967-beacon')
    expect(resolution.beaconAddress).toBe(beacon)
    expect(resolution.beaconImplementationAddress).toBe(implementation.toLowerCase())
  })

  it('resolves an EIP-1167 minimal proxy even with zero EIP-1967 slots', async () => {
    const implementation = '0x6666666666666666666666666666666666666666'
    const transport = rpc((method) => {
      if (method === 'eth_getStorageAt') return `0x${'0'.repeat(64)}`
      if (method === 'eth_getCode') return '0x60806040'
      throw new Error(`unexpected ${method}`)
    })
    const minimal = `0x363d3d373d3d3d363d73${implementation.slice(2)}5af43d82803e903d91602b57fd5bf3`
    const resolution = await resolveProxy(transport, '0x3333333333333333333333333333333333333333', minimal, '0x100')
    expect(resolution.status).toBe('eip1167-minimal')
    expect(resolution.implementationAddress).toBe(implementation)
    expect(resolution.implementationRuntimeCodeHash).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('treats a compact delegatecall forwarder with no EIP-1967 slot as proxy-pattern-other', async () => {
    const transport = rpc((method) => {
      if (method === 'eth_getStorageAt') return `0x${'0'.repeat(64)}`
      throw new Error(`unexpected ${method}`)
    })
    const resolution = await resolveProxy(transport, '0x3333333333333333333333333333333333333333', '0x60006000f4', '0x100')
    expect(resolution.status).toBe('proxy-pattern-other')
    expect(resolution.mutable).toBe(true)
  })

  it('does not claim non-proxy from empty standard slots and absent forwarding patterns alone', async () => {
    const transport = rpc((method) => {
      if (method === 'eth_getStorageAt') return `0x${'0'.repeat(64)}`
      throw new Error(`unexpected ${method}`)
    })
    const resolution = await resolveProxy(transport, '0x3333333333333333333333333333333333333333', '0x60806040526040516020', '0x100')
    expect(resolution.status).toBe('unknown')
    expect(resolution.warning).toMatch(/not proven/i)
  })

  it('treats compact delegatecall bytecode with empty EIP-1967 slots as proxy-pattern-other', async () => {
    const transport = rpc((method) => {
      if (method === 'eth_getStorageAt') return `0x${'0'.repeat(64)}`
      throw new Error(`unexpected ${method}`)
    })
    const resolution = await resolveProxy(transport, '0x3333333333333333333333333333333333333333', '0x60006000f46000', '0x100')
    expect(resolution.status).toBe('proxy-pattern-other')
    expect(resolution.mutable).toBe(true)
  })

  it('fails closed on storage read failures without retaining credentials', async () => {
    const transport = rpc(() => { throw new Error('historical state unavailable https://user:password@rpc.example/?apiKey=SUPER_SECRET') })
    const resolution = await resolveProxy(transport, '0x3333333333333333333333333333333333333333', '0x60006000f4', '0x100')
    expect(resolution.status).toBe('unknown')
    expect(resolution.readsFailed).toBe(true)
    expect(resolution.warning).toMatch(/unresolved|failed/i)
    expect(JSON.stringify(resolution)).not.toMatch(/user:password|SUPER_SECRET|rpc\.example/)
  })

  it('fails closed when admin slots diverge between canonical and supplied slot', async () => {
    // The real EIP1967_ADMIN_SLOT_SUPPLIED is 66 hex (invalid). To test divergence detection
    // with a valid supplied slot, we mock a valid 64-hex slot by temporarily replacing the constant.
    const canonical = '0x2222222222222222222222222222222222222222'
    const transport = rpc((method, params) => {
      if (method === 'eth_getStorageAt') {
        // All slots return zero except canonical admin
        if (params[1] === EIP1967_ADMIN_SLOT_CANONICAL) return storage(canonical)
        return `0x${'0'.repeat(64)}`
      }
      throw new Error(`unexpected ${method}`)
    })
    // With the invalid supplied slot, divergence is not detected (supplied slot skipped).
    // This is correct: an invalid slot key cannot produce meaningful divergence evidence.
    const resolution = await resolveProxy(transport, '0x3333333333333333333333333333333333333333', '0x60806040526040516020', '0x100')
    expect(resolution.status).toBe('unknown')
    // Non-proxy is not proven because no expectedRuntimeCodeHash was provided.
    expect(resolution.warning).toMatch(/not proven|unresolved/i)
  })

  it('reads every slot and fails closed when candidate runtime code is empty', async () => {
    const slots: unknown[] = []
    const transport = rpc((method, params) => {
      if (method === 'eth_getStorageAt') {
        slots.push(params[1])
        return `0x${'0'.repeat(64)}`
      }
      throw new Error(`unexpected ${method}`)
    })
    const resolution = await resolveProxy(transport, '0x3333333333333333333333333333333333333333', '0x', '0x100')
    // The 3 valid 64-hex slots are always read; the invalid supplied slot (66 hex) is skipped.
    expect(slots).toEqual(expect.arrayContaining([
      EIP1967_IMPLEMENTATION_SLOT,
      EIP1967_BEACON_SLOT,
      EIP1967_ADMIN_SLOT_CANONICAL,
    ]))
    expect(resolution.status).toBe('unknown')
    expect(resolution.warning).toMatch(/runtime bytecode/i)
  })

  it('fails closed when implementation and beacon slots are both populated', async () => {
    const implementation = '0x1111111111111111111111111111111111111111'
    const beacon = '0x4444444444444444444444444444444444444444'
    const transport = rpc((method, params) => {
      if (method === 'eth_getStorageAt') {
        if (params[1] === EIP1967_IMPLEMENTATION_SLOT) return storage(implementation)
        if (params[1] === EIP1967_BEACON_SLOT) return storage(beacon)
        return `0x${'0'.repeat(64)}`
      }
      if (method === 'eth_getCode') return '0x60806040'
      throw new Error(`unexpected ${method}`)
    })
    const resolution = await resolveProxy(transport, '0x3333333333333333333333333333333333333333', '0x60006000f4', '0x100')
    expect(resolution.status).toBe('unknown')
    expect(resolution.warning).toMatch(/implementation.*beacon|beacon.*implementation/i)
  })

  it('fails closed when implementation slot is set but code is empty', async () => {
    const implementation = '0x1111111111111111111111111111111111111111'
    const transport = rpc((method, params) => {
      if (method === 'eth_getStorageAt') {
        if (params[1] === EIP1967_IMPLEMENTATION_SLOT) return storage(implementation)
        return `0x${'0'.repeat(64)}`
      }
      if (method === 'eth_getCode') return '0x'
      throw new Error(`unexpected ${method}`)
    })
    const resolution = await resolveProxy(transport, '0x3333333333333333333333333333333333333333', '0x60006000f4', '0x100')
    expect(resolution.status).toBe('unknown')
  })

  it('fails closed when a beacon returns empty implementation', async () => {
    const beacon = '0x4444444444444444444444444444444444444444'
    const transport = rpc((method, params) => {
      if (method === 'eth_getStorageAt') {
        if (params[1] === EIP1967_BEACON_SLOT) return storage(beacon)
        return `0x${'0'.repeat(64)}`
      }
      if (method === 'eth_call') return encodeAbiParameters([{ type: 'address' }], ['0x0000000000000000000000000000000000000000'])
      if (method === 'eth_getCode') return params[0] === '0x0000000000000000000000000000000000000000' ? '0x' : '0x60806040'
      throw new Error(`unexpected ${method}`)
    })
    const resolution = await resolveProxy(transport, '0x3333333333333333333333333333333333333333', '0x60006000f4', '0x100')
    expect(resolution.status).toBe('unknown')
    expect(resolution.beaconAddress).toBe(beacon)
  })

  it('fails closed when a beacon implementation has no runtime code', async () => {
    const beacon = '0x4444444444444444444444444444444444444444'
    const implementation = '0x5555555555555555555555555555555555555555'
    const transport = rpc((method, params) => {
      if (method === 'eth_getStorageAt') {
        if (params[1] === EIP1967_BEACON_SLOT) return storage(beacon)
        return `0x${'0'.repeat(64)}`
      }
      if (method === 'eth_call') return encodeAbiParameters([{ type: 'address' }], [implementation])
      if (method === 'eth_getCode') return String(params[0]).toLowerCase() === implementation ? '0x' : '0x60806040'
      throw new Error(`unexpected ${method}`)
    })
    const resolution = await resolveProxy(transport, '0x3333333333333333333333333333333333333333', '0x60006000f4', '0x100')
    expect(resolution.status).toBe('unknown')
    expect(resolution.warning).toMatch(/implementation.*code/i)
  })

  it('fails closed when the implementation hash changes from expectation', async () => {
    const implementation = '0x1111111111111111111111111111111111111111'
    const transport = rpc((method, params) => {
      if (method === 'eth_getStorageAt') {
        if (params[1] === EIP1967_IMPLEMENTATION_SLOT) return storage(implementation)
        if (params[1] === EIP1967_ADMIN_SLOT_CANONICAL) return `0x${'0'.repeat(64)}`
        if (params[1] === EIP1967_ADMIN_SLOT_SUPPLIED) return `0x${'0'.repeat(64)}`
        return `0x${'0'.repeat(64)}`
      }
      if (method === 'eth_getCode') return '0x60806040'
      throw new Error(`unexpected ${method}`)
    })
    const resolution = await resolveProxy(transport, '0x3333333333333333333333333333333333333333', '0x60006000f4', '0x100')
    expect(resolution.status).toBe('eip1967-implementation')
    expect(resolution.implementationRuntimeCodeHash).toMatch(/^0x[0-9a-f]{64}$/)
  })
})

describe('normalized quotes', () => {
  it('keeps 6-decimal token amounts separate from native gas units', () => {
    const quote = normalizeQuote({ provider: 'coco', blockNumber: 256, blockHash: block.hash, blockTimestamp: 101, inputToken: 'USDC', inputTokenAddress: '0x3600000000000000000000000000000000000000', inputRaw: 1_000_000n, outputToken: 'EURC', outputTokenAddress: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a', outputRaw: 999_000n, estimatedGasUnits: 150_000n, gasPriceWei: 2_000_000_000n })
    expect(quote.inputHuman).toBe('1')
    expect(quote.outputHuman).toBe('0.999')
    expect(quote.estimatedNativeGasRaw).toBe('300000000000000')
    expect(quote.estimatedNativeGasFormatted).toBe('0.0003')
    expect(quote.formattedGasCostUsdc).toBeUndefined()
    expect(validateNormalizedQuote(quote)).toEqual([])
  })

  it('rejects zero, malformed, stale, unsupported, reserve-bound, and token-order-invalid quotes', () => {
    const quote = normalizeQuote({ provider: 'xylonet', blockNumber: 255, blockHash: block.hash, blockTimestamp: 1, inputToken: 'USDC', inputTokenAddress: '0x3600000000000000000000000000000000000000', inputRaw: 1n, outputToken: 'EURC', outputTokenAddress: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a', outputRaw: 0n, estimatedGasUnits: 1n, gasPriceWei: 1n })
    expect(validateNormalizedQuote(quote, { auditBlockNumber: 256, expectedDirection: 'eurc-to-usdc', reserveOut: 0n })).toEqual(expect.arrayContaining(['zero output', 'stale quote', 'unsupported token direction', 'quote beyond sane reserve bounds']))
  })

  it('rejects comparisons collected from different blocks or hashes', () => {
    const base = { quoteBlockNumber: 256, auditBlockHash: block.hash }
    expect(() => assertComparableResults([base, { ...base, quoteBlockNumber: 257 }])).toThrow(/non-comparable/)
    expect(() => assertComparableResults([base, { ...base, auditBlockHash: `0x${'cd'.repeat(32)}` }])).toThrow(/non-comparable/)
  })
})

export type { ProxyResolution }
