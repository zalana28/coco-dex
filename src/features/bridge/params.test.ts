import { describe, expect, it } from 'vitest'
import { TransferSpeed } from '@circle-fin/bridge-kit'
import { buildBridgeParams, buildRetryContext } from './params'
import type { ViemAdapterInstance } from './params'

const recipient = '0x2222222222222222222222222222222222222222'
const adapter = { id: 'mock-adapter' } as unknown as ViemAdapterInstance

describe('buildBridgeParams canonical shape', () => {
  it('maps Standard/SLOW to transferSpeed SLOW and enables the Forwarding Service', () => {
    const params = buildBridgeParams({ adapter, source: 'Ethereum_Sepolia', recipient, amount: '1', speed: TransferSpeed.SLOW })
    expect(params.config?.transferSpeed).toBe('SLOW')
    expect(params.token).toBe('USDC')
    expect(params.from).toMatchObject({ chain: 'Ethereum_Sepolia', adapter })
    expect(params.to).toMatchObject({ chain: 'Arc_Testnet', recipientAddress: recipient, useForwarder: true })
    expect(params.config?.batchTransactions).toBe(false)
  })

  it('maps Fast/FAST to transferSpeed FAST', () => {
    const params = buildBridgeParams({ adapter, source: 'Base_Sepolia', recipient, amount: '1', speed: TransferSpeed.FAST })
    expect(params.config?.transferSpeed).toBe('FAST')
    expect(params.from.chain).toBe('Base_Sepolia')
  })

  it('estimate and bridge receive byte-identical canonical params', () => {
    // Simulate how the facade builds params for estimate then bridge from the same inputs.
    const estimateCall = buildBridgeParams({ adapter, source: 'Ethereum_Sepolia', recipient, amount: '1', speed: TransferSpeed.SLOW, useForwarder: true, traceId: 'abc' })
    const bridgeCall = buildBridgeParams({ adapter, source: 'Ethereum_Sepolia', recipient, amount: '1', speed: TransferSpeed.SLOW, useForwarder: true, traceId: 'abc' })
    expect(estimateCall).toEqual(bridgeCall)
    expect(JSON.stringify(estimateCall)).toBe(JSON.stringify(bridgeCall))
  })

  it('never produces NaN or floating-point base-unit corruption', () => {
    const params = buildBridgeParams({ adapter, source: 'Ethereum_Sepolia', recipient, amount: '1.5', speed: TransferSpeed.SLOW })
    expect(params.amount).toBe('1.5')
    expect(typeof params.amount).toBe('string')
  })

  it('retry context omits the destination adapter (forwarded mint resume)', () => {
    const context = buildRetryContext(adapter)
    expect(context).toEqual({ from: adapter, to: undefined })
  })
})
