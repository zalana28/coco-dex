import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_SYNTHRA_FEE,
  getPairKey,
  getWinningSynthraFee,
  recordWinningSynthraFee,
  resetSynthraFeeCache,
  selectWinningSynthraFee,
  type SynthraFee,
} from './synthraFeeCache'

const USDC = '0x3600000000000000000000000000000000000000'
const EURC = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a'

beforeEach(resetSynthraFeeCache)

describe('getPairKey', () => {
  it('is case-insensitive, so checksum and lowercase addresses agree', () => {
    expect(getPairKey(EURC, USDC)).toBe(getPairKey(EURC.toLowerCase(), USDC))
  })

  it('distinguishes direction', () => {
    expect(getPairKey(USDC, EURC)).not.toBe(getPairKey(EURC, USDC))
  })
})

describe('getWinningSynthraFee', () => {
  it('falls back to the default tier for an unseen pair', () => {
    expect(getWinningSynthraFee(getPairKey(USDC, EURC))).toBe(DEFAULT_SYNTHRA_FEE)
  })

  it('returns the recorded tier once one has won', () => {
    const key = getPairKey(USDC, EURC)
    recordWinningSynthraFee(key, 3_000)

    expect(getWinningSynthraFee(key)).toBe(3_000)
    // Other pairs are unaffected.
    expect(getWinningSynthraFee(getPairKey(EURC, USDC))).toBe(DEFAULT_SYNTHRA_FEE)
  })
})

describe('selectWinningSynthraFee', () => {
  const amounts = (v: Partial<Record<SynthraFee, bigint>>): Record<SynthraFee, bigint | undefined> => ({
    500: v[500],
    3_000: v[3_000],
    10_000: v[10_000],
  })

  it('picks the tier with the highest output', () => {
    expect(selectWinningSynthraFee(amounts({ 500: BigInt(100), 3_000: BigInt(120), 10_000: BigInt(90) }))).toBe(3_000)
  })

  it('ignores tiers that were not read', () => {
    expect(selectWinningSynthraFee(amounts({ 3_000: BigInt(50) }))).toBe(3_000)
  })

  it('ignores zero output — an empty pool must not win', () => {
    expect(selectWinningSynthraFee(amounts({ 500: BigInt(0), 10_000: BigInt(5) }))).toBe(10_000)
  })

  it('returns undefined when nothing usable was read, so an earlier winner is kept', () => {
    expect(selectWinningSynthraFee(amounts({}))).toBeUndefined()
    expect(selectWinningSynthraFee(amounts({ 500: BigInt(0) }))).toBeUndefined()
  })
})
