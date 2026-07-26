import { describe, expect, it } from 'vitest'
import { USDC, EURC } from '@/config/tokens'
import {
  GAS_BUFFER_USDC,
  MIN_NATIVE_GAS_WEI,
  exceedsBalance,
  getMaxSpendable,
  getRequiredBalance,
  hasInsufficientGas,
  isNativeBackedToken,
  leavesTooLittleForGas,
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

describe('getRequiredBalance', () => {
  it('adds the gas reserve for a token that also pays gas', () => {
    expect(getRequiredBalance(ONE_USDC, USDC)).toBe(ONE_USDC + GAS_BUFFER_USDC)
  })

  it('requires only the amount for a token that does not pay gas', () => {
    expect(getRequiredBalance(ONE_USDC, EURC)).toBe(ONE_USDC)
  })
})

describe('leavesTooLittleForGas', () => {
  it('flags the case the balance check used to miss: amount fits, gas does not', () => {
    // The reported failure shape — 10 USDC swapped against a balance that covers
    // the amount but not the amount plus gas. Simulation passes because eth_call
    // does not deduct the upfront cost; the wallet then refuses.
    const balance = ONE_USDC * BigInt(10) + GAS_BUFFER_USDC / BigInt(2)
    const amount = ONE_USDC * BigInt(10)

    expect(exceedsBalance(amount, balance)).toBe(false)
    expect(leavesTooLittleForGas(amount, balance, USDC)).toBe(true)
  })

  it('does not flag when the reserve is comfortably covered', () => {
    const balance = ONE_USDC * BigInt(10) + GAS_BUFFER_USDC
    expect(leavesTooLittleForGas(ONE_USDC * BigInt(10), balance, USDC)).toBe(false)
  })

  it('does not double-report the plain insufficient-balance case', () => {
    // When the amount alone already exceeds the balance the UI should say
    // "insufficient balance", not blame gas.
    const balance = ONE_USDC
    const amount = ONE_USDC * BigInt(5)

    expect(exceedsBalance(amount, balance)).toBe(true)
    expect(leavesTooLittleForGas(amount, balance, USDC)).toBe(false)
  })

  it('never flags a token that does not pay gas', () => {
    const balance = ONE_USDC * BigInt(10)
    expect(leavesTooLittleForGas(balance, balance, EURC)).toBe(false)
  })

  it('does not block while the balance is still loading', () => {
    expect(leavesTooLittleForGas(ONE_USDC, undefined, USDC)).toBe(false)
    expect(exceedsBalance(ONE_USDC, undefined)).toBe(false)
  })

  it('agrees with getMaxSpendable — the Max button never trips its own guard', () => {
    const balance = ONE_USDC * BigInt(10)
    const max = getMaxSpendable(balance, USDC)
    expect(leavesTooLittleForGas(max, balance, USDC)).toBe(false)
  })
})
