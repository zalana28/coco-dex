import { describe, expect, it } from 'vitest'
import {
  detectProxyPattern,
  parseAddressFromStorage,
  EIP1967_IMPLEMENTATION_SLOT,
  EIP1967_BEACON_SLOT,
  EIP1967_ADMIN_SLOT_CANONICAL,
  EIP1967_ADMIN_SLOT_SUPPLIED,
} from './proxy'

const implementation = '0x1111111111111111111111111111111111111111'
const storage = `0x${'0'.repeat(24)}${implementation.slice(2)}`

describe('proxy detection and resolution', () => {
  it('exports canonical EIP-1967 slots and parses storage addresses', () => {
    expect(EIP1967_IMPLEMENTATION_SLOT).toMatch(/^0x[0-9a-f]{64}$/)
    expect(EIP1967_BEACON_SLOT).toMatch(/^0x[0-9a-f]{64}$/)
    expect(EIP1967_ADMIN_SLOT_CANONICAL).toMatch(/^0x[0-9a-f]{64}$/i)
    expect(EIP1967_ADMIN_SLOT_SUPPLIED).toMatch(/^0x[0-9a-f]+$/i)
    expect(parseAddressFromStorage(storage)).toBe(implementation)
    expect(parseAddressFromStorage(`0x${'0'.repeat(64)}`)).toBeUndefined()
  })

  it('detects an EIP-1167 minimal proxy and pins its implementation', () => {
    const code = `0x363d3d373d3d3d363d73${implementation.slice(2)}5af43d82803e903d91602b57fd5bf3`
    expect(detectProxyPattern(code)).toEqual({ kind: 'eip1167-minimal', implementationAddress: implementation })
  })

  it('classifies non-forwarding runtime as none', () => {
    expect(detectProxyPattern('0x6080604052348015600f57600080fd5b50')).toEqual({ kind: 'none' })
  })

  it('flags recognizable delegatecall forwarding as a proxy pattern', () => {
    expect(detectProxyPattern('0x600060003660006000f4')).toEqual({ kind: 'delegatecall-forwarder' })
  })

  it('does not classify a large implementation containing delegatecall as a compact forwarding proxy', () => {
    expect(detectProxyPattern(`0x${'00'.repeat(600)}f4`)).toEqual({ kind: 'none' })
  })

  it('does not treat a delegatecall byte inside PUSH data as a forwarding opcode', () => {
    expect(detectProxyPattern('0x60f4600055')).toEqual({ kind: 'none' })
  })

  it('does not execute-scan Solidity CBOR metadata bytes', () => {
    // Last two bytes encode a one-byte metadata trailer containing 0xf4.
    expect(detectProxyPattern('0x6000f40001')).toEqual({ kind: 'none' })
  })

  it('rejects malformed or empty bytecode', () => {
    expect(() => detectProxyPattern('0x')).toThrow(/missing bytecode/)
    expect(() => detectProxyPattern('not-hex')).toThrow(/malformed bytecode/)
  })
})
