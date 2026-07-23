import { describe, expect, it } from 'vitest'
import { attemptStore, memoryStorage } from './recovery'
import { createBridgeAttempt, type BridgeAttempt } from './attempt'

function makeAttempt(id: string, overall: BridgeAttempt['overallState'] = 'complete'): BridgeAttempt {
  const a = createBridgeAttempt({ account: '0x1', source: 'Ethereum_Sepolia', sourceChainId: 11155111, sourceDomain: 0, recipient: '0x2', amount: '1', transferSpeed: 'SLOW', useForwarder: true })
  a.id = id
  a.overallState = overall
  return a
}

describe('attempt store', () => {
  it('persists and reloads attempts independently', () => {
    const storage = memoryStorage()
    const store = attemptStore(storage)
    store.save(makeAttempt('a1'))
    store.save(makeAttempt('a2'))
    const all = store.loadAll()
    expect(all.map((a) => a.id).sort()).toEqual(['a1', 'a2'])
  })

  it('upsert does not overwrite a different attempt', () => {
    const store = attemptStore(memoryStorage())
    store.save(makeAttempt('a1'))
    store.save(makeAttempt('a2'))
    store.save(makeAttempt('a1', 'terminal-error'))
    expect(store.loadAll().find((a) => a.id === 'a1')!.overallState).toBe('terminal-error')
    expect(store.loadAll().find((a) => a.id === 'a2')).toBeDefined()
  })

  it('removes by id only', () => {
    const store = attemptStore(memoryStorage())
    store.save(makeAttempt('a1'))
    store.save(makeAttempt('a2'))
    store.remove('a1')
    expect(store.loadAll().map((a) => a.id)).toEqual(['a2'])
  })

  it('does not persist sensitive objects (adapter/provider/client)', () => {
    const storage = memoryStorage()
    const store = attemptStore(storage)
    const a = makeAttempt('a1')
    // Attach a non-serializable value; JSON sanitization must drop functions
    // (adapter/provider instances are never stored as plain data).
    a.bridgeResult = { adapter: { secret: 'x' }, sign: () => undefined } as unknown
    store.save(a)
    const raw = JSON.parse(storage.getItem('coco:cctp-v2:attempts')!)
    expect(JSON.stringify(raw)).not.toContain('"sign"')
    expect(JSON.stringify(raw)).not.toContain('function')
  })

  it('migrates a v1 single-record shape into attempts', () => {
    const storage = memoryStorage()
    const v1 = {
      schemaVersion: 1,
      sdkVersion: '@circle-fin/bridge-kit@1.12.1',
      protocolVersion: 'CCTPV2',
      wallet: '0x1',
      source: 'Ethereum_Sepolia',
      destination: 'Arc_Testnet',
      recipient: '0x2',
      amount: '1',
      mode: 'SLOW',
      steps: [{ name: 'approve', state: 'success' }, { name: 'burn', state: 'success', txHash: '0xdead' }, { name: 'fetchAttestation', state: 'success' }, { name: 'mint', state: 'success', txHash: '0xbeef' }],
      sdkResult: { amount: '1', token: 'USDC', state: 'success', provider: 'CCTPV2BridgingProvider', sourceAddress: '0x1', destinationAddress: '0x2', recipientAddress: '0x2', useForwarder: true, transferSpeed: 'SLOW', steps: [{ name: 'approve', state: 'success' }, { name: 'burn', state: 'success', txHash: '0xdead' }, { name: 'fetchAttestation', state: 'success' }, { name: 'mint', state: 'success', txHash: '0xbeef' }] },
      burnHash: '0xdead',
      createdAt: 1,
      updatedAt: 2,
    }
    storage.setItem('coco:cctp-v2:attempts', JSON.stringify(v1))
    const store = attemptStore(storage)
    const all = store.loadAll()
    expect(all.length).toBe(1)
    expect(all[0]!.steps.burn.txHash).toBe('0xdead')
  })

  it('keeps at least five attempts in history', () => {
    const store = attemptStore(memoryStorage())
    for (let i = 1; i <= 7; i++) store.save(makeAttempt(`a${i}`))
    expect(store.loadAll().length).toBeGreaterThanOrEqual(5)
  })
})
