import { describe, expect, it } from 'vitest'
import deployment from '../../../contracts/deployments/classic-v2-arc-testnet.json'
import { QUOTE_INPUTS } from './live'
import { ROUTER_AUDIT_REGISTRY } from './registry'
import { redactSensitiveText } from './transport'

describe('provider-specific discovery safety', () => {
  it('pins Coco canonical deployment evidence without modifying it', () => {
    const coco = ROUTER_AUDIT_REGISTRY.find(({ id }) => id === 'coco')!
    expect(coco.chainId).toBe(5_042_002)
    expect(coco.router?.address).toBe(deployment.router.toLowerCase())
    expect(coco.factory?.address).toBe(deployment.factory.toLowerCase())
    expect(coco.pools[0]?.address).toBe(deployment.pair.toLowerCase())
    expect(coco.supportedTokens.map(({ decimals }) => decimals)).toEqual([6, 6])
    expect(QUOTE_INPUTS).toEqual(['0.01', '0.1', '1', '10', '100'])
  })

  it('preserves XyloNet candidates but does not expose approval or execution generation', () => {
    const provider = ROUTER_AUDIT_REGISTRY.find(({ id }) => id === 'xylonet')!
    expect(provider.router?.address).toBe('0x73742278c31a76dbb0d2587d03ef92e6e2141023')
    expect(provider.pools[0]?.address).toBe('0x3df3966f5138143dce7a9cfddc2c0310ce083bb1')
    expect(provider.allowanceTarget).toBeUndefined()
    expect(provider.executionTarget).toBeUndefined()
    expect(provider.executionDirections).toEqual([])
  })

  it('keeps UnitFlow V3, V4, WUSDC, UniversalRouter, and Permit2 non-executable', () => {
    const provider = ROUTER_AUDIT_REGISTRY.find(({ id }) => id === 'unitflow')!
    const inventoryRoles = provider.inventoryCandidates.map(({ role }) => role)
    const conflictRoles = provider.conflictingCandidates.map(({ role }) => role)
    expect(inventoryRoles).toEqual(expect.arrayContaining(['wrapper', 'permit2', 'position-manager']))
    expect(conflictRoles).toEqual(expect.arrayContaining(['universal-router', 'position-manager', 'position-descriptor']))
    expect(provider.quoteDirections).toEqual([])
    expect(provider.executionDirections).toEqual([])
    expect(provider.status).toBe('disabled')
  })

  it('keeps Synthra unavailable for quotes until authoritative Arc deployment relationships exist', () => {
    const provider = ROUTER_AUDIT_REGISTRY.find(({ id }) => id === 'synthra')!
    expect(provider.evidenceSources.some(({ kind }) => kind === 'official-deployment-file')).toBe(false)
    expect(provider.evidenceSources.some(({ kind }) => kind === 'verified-explorer-source')).toBe(false)
    expect(provider.quoteDirections).toEqual([])
    expect(provider.executionDirections).toEqual([])
  })
})

describe('privacy redaction', () => {
  it('redacts credentialed URLs, query strings, auth-like values, and local paths', () => {
    const input = 'https://user:pass@rpc.example/path?api_key=secret authorization: Bearer-token /Users/alice/private/repo'
    const redacted = redactSensitiveText(input)
    expect(redacted).not.toContain('secret')
    expect(redacted).not.toContain('Bearer-token')
    expect(redacted).not.toContain('/Users/alice')
    expect(redacted).toContain('[REDACTED_URL]')
    expect(redacted).toContain('[REDACTED_PATH]')
  })
})
