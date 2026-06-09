import { describe, expect, it } from 'vitest'
import { COCO_STABLE_POOL_ROUTING_ENABLED, isCocoStablePoolExecutableRoute } from './cocoStablePoolGuard'

describe('CocoStablePool routing guard', () => {
  it('keeps CocoStablePool out of executable smart routes for the beta branch', () => {
    expect(COCO_STABLE_POOL_ROUTING_ENABLED).toBe(false)
    expect(isCocoStablePoolExecutableRoute()).toBe(false)
  })
})
