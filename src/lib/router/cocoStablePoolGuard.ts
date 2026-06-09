/**
 * CocoStablePool V1 is public on Arc Testnet only as an LP Beta.
 * It must stay out of smart routing until a separate Stable Pool V2 routing
 * branch adds liquidity thresholds, caps, simulations, and release approval.
 */
export const COCO_STABLE_POOL_ROUTING_ENABLED = false

export function isCocoStablePoolExecutableRoute() {
  return COCO_STABLE_POOL_ROUTING_ENABLED
}
