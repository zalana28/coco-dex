import { describe, expect, it } from 'vitest'
import { COCO_STABLE_LP_DECIMALS_FALLBACK, COCO_STABLE_LP_READ_ABI } from './cocoStablePool'

describe('CocoStablePool config', () => {
  it('uses the ERC20 LP decimals fallback and exposes a live decimals read', () => {
    expect(COCO_STABLE_LP_DECIMALS_FALLBACK).toBe(18)
    expect(COCO_STABLE_LP_READ_ABI.some((item) => item.type === 'function' && item.name === 'decimals')).toBe(true)
  })
})
