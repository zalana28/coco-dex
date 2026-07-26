import { describe, expect, it } from 'vitest'
import { USDC, EURC } from '@/config/tokens'
import {
  GAS_BUFFER_USDC,
  MIN_NATIVE_GAS_WEI,
  getMaxSpendable,
  hasInsufficientGas,
  isNativeBackedToken,
} from './gasReserve'

const ONE_USDC = BigInt(1_000_000) // 6 decimals

describe('isNativeBackedToken', () => {
  it('identifies ERC-20 USDC, which shares its balance with native gas', () => {
    expect(isNativeBackedToken(USDC)).toBe(true)
  })

  it('does not flag EURC', () => {
    expect(isNativeBackedToken(EURC)).toBe(false)
  })

  it('is case-insensitive about the address', () => {
    expect(isNativeBackedToken({ ...USDC, address: USDC.address.toUpperCase() as `0x${string}` })).toBe(true)
  })
})

describe('getMaxSpendable', () => {
  it('holds back a gas buffer for USDC', () => {
    const balance = ONE_USDC * BigInt(10)
    expect(getMaxSpendable(balance, USDC)).toBe(balance - GAS_BUFFER_USDC)
  })

  it('returns the full balance for a token that does not pay gas', () => {
    const balance = ONE_USDC * BigInt(10)
    expect(getMaxSpendable(balance, EURC)).toBe(balance)
  })

  it('returns zero rather than a negative amount when below the buffer', () => {
    expect(getMaxSpendable(GAS_BUFFER_USDC / BigInt(2), USDC)).toBe(BigInt(0))
  })

  it('returns zero at exactly the buffer', () => {
    expect(getMaxSpendable(GAS_BUFFER_USDC, USDC)).toBe(BigInt(0))
  })

  it('leaves something spendable just above the buffer', () => {
    expect(getMaxSpendable(GAS_BUFFER_USDC + BigInt(1), USDC)).toBe(BigInt(1))
  })

  it('handles a zero balance', () => {
    expect(getMaxSpendable(BigInt(0), USDC)).toBe(BigInt(0))
    expect(getMaxSpendable(BigInt(0), EURC)).toBe(BigInt(0))
  })
})

describe('hasInsufficientGas', () => {
  it('flags a native balance below the floor', () => {
    expect(hasInsufficientGas(MIN_NATIVE_GAS_WEI - BigInt(1))).toBe(true)
  })

  it('accepts a balance at or above the floor', () => {
    expect(hasInsufficientGas(MIN_NATIVE_GAS_WEI)).toBe(false)
    expect(hasInsufficientGas(MIN_NATIVE_GAS_WEI * BigInt(10))).toBe(false)
  })

  it('does not block while the balance is still loading', () => {
    // Blocking the button on a pending read is worse than letting simulation
    // catch it.
    expect(hasInsufficientGas(undefined)).toBe(false)
  })

  it('flags an empty wallet', () => {
    expect(hasInsufficientGas(BigInt(0))).toBe(true)
  })
})
