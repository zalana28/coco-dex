import { describe, expect, it } from 'vitest'
import deployment from '../../../contracts/deployments/classic-v2-arc-testnet.json'
import { ROUTER_AUDIT_REGISTRY } from './registry'
import { routerRegistrySchema } from './types'

describe('canonical router audit registry', () => {
  it('contains exactly Coco, XyloNet, UnitFlow, and Synthra and passes the schema', () => {
    const parsed = routerRegistrySchema.parse(ROUTER_AUDIT_REGISTRY)
    expect(parsed.map(({ id }) => id)).toEqual(['coco', 'xylonet', 'unitflow', 'synthra'])
  })

  it('derives Coco addresses and hashes from the canonical deployment JSON', () => {
    const coco = ROUTER_AUDIT_REGISTRY.find(({ id }) => id === 'coco')!
    expect(coco.id).toBe('coco')
    expect(coco.factory?.address).toBe(deployment.factory.toLowerCase())
    expect(coco.router?.address).toBe(deployment.router.toLowerCase())
    expect(coco.pools[0]?.address).toBe(deployment.pair.toLowerCase())
    expect(coco.router?.expectedRuntimeCodeHash).toBe(deployment.routerCodeHash)
    expect(coco.factory?.expectedRuntimeCodeHash).toBe(deployment.factoryCodeHash)
    expect(coco.pools[0]?.expectedRuntimeCodeHash).toBe(deployment.pairCodeHash)
  })

  it('keeps every provider non-executable until a fresh fixed-block live audit passes', () => {
    for (const provider of ROUTER_AUDIT_REGISTRY) {
      expect(provider.status).not.toBe('verified-executable')
      expect(provider.executionDirections).toEqual([])
      expect(provider.allowanceTarget).toBeUndefined()
      expect(provider.executionTarget).toBeUndefined()
      expect(provider.disableReason).toBeTruthy()
    }
  })

  it('preserves UnitFlow documentation conflicts and WUSDC/UniversalRouter uncertainty', () => {
    const unitflow = ROUTER_AUDIT_REGISTRY.find(({ id }) => id === 'unitflow')!
    expect(unitflow.conflictingCandidates.filter(({ conflictGroup }) => conflictGroup === 'unitflow-v3-router')).toHaveLength(5)
    expect(unitflow.conflictingCandidates.filter(({ conflictGroup }) => conflictGroup === 'unitflow-v3-position-manager')).toHaveLength(5)
    expect(unitflow.conflictingCandidates.filter(({ conflictGroup }) => conflictGroup === 'unitflow-v4-pool-manager')).toHaveLength(2)
    expect(unitflow.inventoryCandidates.some(({ role }) => role === 'wrapper')).toBe(true)
    expect(unitflow.conflictingCandidates.some(({ role }) => role === 'universal-router')).toBe(true)
    expect(unitflow.status).toBe('disabled')
  })

  it('does not infer an executable Synthra Arc deployment from frontend configuration', () => {
    const synthra = ROUTER_AUDIT_REGISTRY.find(({ id }) => id === 'synthra')!
    expect(['unavailable', 'unverified']).toContain(synthra.status)
    expect(synthra.executionTarget).toBeUndefined()
    expect(synthra.allowanceTarget).toBeUndefined()
  })
})
