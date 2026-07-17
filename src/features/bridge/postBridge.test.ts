import { describe, expect, it } from 'vitest'
import { bridgeLiquidityPath, bridgeSwapPath, safeBridgeAmount } from './postBridge'

describe('post-bridge actions', () => {
  it('prefills only a safe six-decimal USDC amount', () => {
    expect(safeBridgeAmount('1.250001')).toBe('1.250001')
    expect(safeBridgeAmount('1.2500001')).toBeNull()
    expect(safeBridgeAmount('0')).toBeNull()
    expect(safeBridgeAmount('-1')).toBeNull()
  })

  it('navigates without executing a swap or liquidity transaction', () => {
    expect(bridgeSwapPath('1.25')).toBe('/swap?from=USDC&to=EURC&chain=Arc_Testnet&amount=1.25')
    expect(bridgeSwapPath('unsafe')).toBe('/swap?from=USDC&to=EURC&chain=Arc_Testnet')
    expect(bridgeLiquidityPath).toBe('/pools/add')
  })
})
