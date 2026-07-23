import { describe, expect, it } from 'vitest'
import { CONTRACT_REGISTRY, validateContractConfig } from './contractVerification'

describe('CONTRACT_REGISTRY', () => {
  it('all addresses are valid 42-char hex strings', () => {
    for (const [name, addr] of Object.entries(CONTRACT_REGISTRY)) {
      expect(addr, `${name} address format`).toMatch(/^0x[0-9a-fA-F]{40}$/)
    }
  })

  it('no address is the zero address', () => {
    const zero = '0x0000000000000000000000000000000000000000'
    for (const [name, addr] of Object.entries(CONTRACT_REGISTRY)) {
      expect(addr.toLowerCase(), `${name} is zero address`).not.toBe(zero)
    }
  })

  it('Coco Router address matches config/contracts.ts', () => {
    expect(CONTRACT_REGISTRY.cocoRouter).toBe('0xC31166847A4CEC31629a0ABe4E6383B3CD75732A')
  })

  it('Coco Factory address matches config/contracts.ts', () => {
    expect(CONTRACT_REGISTRY.cocoFactory).toBe('0xE1E39F01207cD3f56d3b2a69B757cf2b59c8e5bE')
  })

  it('Coco USDC/EURC Pair address matches config/contracts.ts', () => {
    expect(CONTRACT_REGISTRY.cocoUsdcEurcPair).toBe('0x0eEA9DC9153215B15b1E6c43f4D68779002d4F1c')
  })

  it('USDC address matches tokens config', () => {
    expect(CONTRACT_REGISTRY.usdc).toBe('0x3600000000000000000000000000000000000000')
  })

  it('EURC address matches tokens config', () => {
    expect(CONTRACT_REGISTRY.eurc).toBe('0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a')
  })

  it('XyloNet Router address matches externalDexes config', () => {
    expect(CONTRACT_REGISTRY.xylonetRouter).toBe('0x73742278c31a76dBb0D2587d03ef92E6E2141023')
  })
})

describe('validateContractConfig', () => {
  it('does not throw with valid config', () => {
    expect(() => validateContractConfig()).not.toThrow()
  })
})
