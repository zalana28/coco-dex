import { EURC, USDC } from '@/config/tokens'
import type { Token } from '@/types/token'

export const COCO_STABLE_POOL_CHAIN_ID = 5_042_002
export const COCO_STABLE_POOL_ADDRESS = '0x0EA7A79F8864091ac7F2B8643BaA7598a9d05a83' as const
export const COCO_STABLE_LP_TOKEN_ADDRESS = '0xfE4A959c689019E09f584F25114Bb5A5e2aA8499' as const
export const COCO_STABLE_LP_DECIMALS_FALLBACK = 18
export const COCO_STABLE_POOL_ARCSCAN_BASE_URL = 'https://testnet.arcscan.app/address'
export const COCO_STABLE_POOL_SAMPLE_QUOTE_INPUT = BigInt(100000)

/**
 * CocoStable Pool READ ABI — corrected from on-chain audit (2026-07).
 *
 * Deployed contract (0x0EA7A79F8864091ac7F2B8643BaA7598a9d05a83) uses
 * token0()/token1() (Uniswap V2 naming) instead of getTokens(), and does
 * NOT expose getBalances(), feeBps(), or amplificationParameter() as view
 * functions. Balances are read via ERC-20 balanceOf(pool) on each token.
 * feeBps and amplificationParameter use config fallback values.
 *
 * Functions confirmed working via eth_call:
 *   paused()         ✓ selector 0x5c975abb
 *   lpToken()        ✓ selector 0x5fcbd285
 *   token0()         ✓ selector 0x0dfe1681
 *   token1()         ✓ selector 0xd21220a7
 *   owner()          ✓ selector 0x8da5cb5b
 *
 * Functions that REVERT (ABI mismatch with deployed bytecode):
 *   getTokens()        ✗
 *   getBalances()      ✗
 *   feeBps()           ✗
 *   amplificationParameter() ✗
 *   getAmountOut()     ✗
 */
export const COCO_STABLE_POOL_READ_ABI = [
  {
    type: 'function',
    name: 'paused',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'lpToken',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'token0',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'token1',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
] as const

export const COCO_STABLE_POOL_ADD_LIQUIDITY_ABI = [
  ...COCO_STABLE_POOL_READ_ABI,
  {
    type: 'function',
    name: 'addLiquidity',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount0', type: 'uint256' },
      { name: 'amount1', type: 'uint256' },
      { name: 'minLpOut', type: 'uint256' },
      { name: 'to', type: 'address' },
    ],
    outputs: [{ name: 'lpMinted', type: 'uint256' }],
  },
] as const

export const COCO_STABLE_POOL_REMOVE_LIQUIDITY_ABI = [
  {
    type: 'function',
    name: 'paused',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'removeLiquidity',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'lpAmount', type: 'uint256' },
      { name: 'minAmount0Out', type: 'uint256' },
      { name: 'minAmount1Out', type: 'uint256' },
      { name: 'to', type: 'address' },
    ],
    outputs: [
      { name: 'amount0', type: 'uint256' },
      { name: 'amount1', type: 'uint256' },
    ],
  },
] as const

export const COCO_STABLE_ERC20_LIQUIDITY_ABI = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const

export const COCO_STABLE_LP_READ_ABI = [
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'totalSupply',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export type CocoStablePoolMetadata = {
  id: string
  pairLabel: string
  typeLabel: string
  status: 'LP Beta'
  chainId: number
  poolAddress: typeof COCO_STABLE_POOL_ADDRESS
  lpTokenAddress: typeof COCO_STABLE_LP_TOKEN_ADDRESS
  tokens: readonly [Token, Token]
  feeBps: number
  feeLabel: string
  amplificationParameter: number
  safetyLabels: readonly string[]
  docsPath: string
  poolArcscanUrl: string
  lpTokenArcscanUrl: string
  fallback: {
    balance0: bigint
    balance1: bigint
    totalLpSupply: bigint
    paused: boolean
    quoteUsdcToEurc: bigint
    quoteEurcToUsdc: bigint
  }
}

export const COCO_STABLE_POOL: CocoStablePoolMetadata = {
  id: 'coco-stable-usdc-eurc-v1',
  pairLabel: 'USDC / EURC',
  typeLabel: 'Stable-swap inspired LP beta',
  status: 'LP Beta',
  chainId: COCO_STABLE_POOL_CHAIN_ID,
  poolAddress: COCO_STABLE_POOL_ADDRESS,
  lpTokenAddress: COCO_STABLE_LP_TOKEN_ADDRESS,
  tokens: [USDC, EURC],
  feeBps: 4,
  feeLabel: '0.04%',
  amplificationParameter: 100,
  safetyLabels: ['Arc Testnet', 'LP Beta', 'Unaudited', 'Not routed'],
  docsPath: '/docs',
  poolArcscanUrl: `${COCO_STABLE_POOL_ARCSCAN_BASE_URL}/${COCO_STABLE_POOL_ADDRESS}`,
  lpTokenArcscanUrl: `${COCO_STABLE_POOL_ARCSCAN_BASE_URL}/${COCO_STABLE_LP_TOKEN_ADDRESS}`,
  // Fallback values from on-chain audit (2026-07): pool is active with real liquidity.
  // USDC balance = 500.3 USDC (500_300_000 raw), EURC balance = 450.3 EURC (450_300_000 raw)
  // LP totalSupply = 450,000,240 (18-decimal units = 450_000_240 * 1e12 raw)
  // quoteUsdcToEurc / quoteEurcToUsdc derived from 500/450 reserve ratio.
  fallback: {
    balance0: BigInt(500_300_000),
    balance1: BigInt(450_300_000),
    totalLpSupply: BigInt(450_000_240) * BigInt(1_000_000_000_000),
    paused: false,
    quoteUsdcToEurc: BigInt(89820),
    quoteEurcToUsdc: BigInt(110870),
  },
} as const
