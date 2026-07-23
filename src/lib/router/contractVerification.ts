/**
 * Contract address and config verification utilities.
 *
 * Audit finding (2026-07):
 * - Coco Router: 0xC31166847A4CEC31629a0ABe4E6383B3CD75732A ✓ deployed
 * - CocoStable Pool: most view functions revert (pool may be paused/uninitialised)
 *   only paused() and lpToken() respond; getTokens/getBalances/feeBps revert.
 * - UnitFlow WUSDC/EURC pair: critically imbalanced (r0 ≈ 0), handled in adapter.
 * - XyloNet: healthy (r0≈8.7M USDC, r1≈375K EURC)
 * - Synthra: all 3 fee tiers have pools with liquidity
 *
 * This module provides build-time and runtime guards so misconfigured addresses
 * fail loudly during development rather than silently in production.
 */

import { arcTestnet } from '@/config/chains'
import {
  ROUTER_ADDRESS,
  FACTORY_ADDRESS,
  USDC_EURC_PAIR_ADDRESS,
} from '@/config/contracts'
import { XYLONET_ROUTER_ADDRESS } from '@/config/externalDexes'
import { USDC, EURC } from '@/config/tokens'

const ARC_CHAIN_ID = arcTestnet.id

/** Canonical address table — single source of truth for all on-chain addresses. */
export const CONTRACT_REGISTRY = {
  // Coco DEX (Arc Testnet, deployed + verified)
  cocoRouter:      ROUTER_ADDRESS,
  cocoFactory:     FACTORY_ADDRESS,
  cocoUsdcEurcPair: USDC_EURC_PAIR_ADDRESS,

  // Tokens
  usdc: USDC.address as `0x${string}`,
  eurc: EURC.address as `0x${string}`,

  // XyloNet
  xylonetRouter: XYLONET_ROUTER_ADDRESS,
} as const

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

function isValidAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr) && addr.toLowerCase() !== ZERO_ADDRESS.toLowerCase()
}

/**
 * Validate all critical addresses at startup.
 * Throws in development, logs a warning in production.
 *
 * Call this once from main.tsx or the wagmi provider wrapper.
 */
export function validateContractConfig(): void {
  const errors: string[] = []

  for (const [name, addr] of Object.entries(CONTRACT_REGISTRY)) {
    if (!isValidAddress(addr as string)) {
      errors.push(`${name}: invalid address "${addr}"`)
    }
  }

  if (ARC_CHAIN_ID !== 5_042_002) {
    errors.push(`Arc Testnet chain ID is ${ARC_CHAIN_ID}, expected 5042002`)
  }

  if (USDC.decimals !== 6) errors.push(`USDC decimals = ${USDC.decimals}, expected 6`)
  if (EURC.decimals !== 6) errors.push(`EURC decimals = ${EURC.decimals}, expected 6`)

  if (errors.length > 0) {
    const msg = `[Coco DEX] Contract config validation failed:\n${errors.map((e) => `  • ${e}`).join('\n')}`
    if (import.meta.env.DEV) {
      throw new Error(msg)
    } else {
      console.error(msg)
    }
  }

  if (import.meta.env.DEV) {
    console.debug('[Coco DEX] Contract config OK:', {
      chainId: ARC_CHAIN_ID,
      ...CONTRACT_REGISTRY,
    })
  }
}
