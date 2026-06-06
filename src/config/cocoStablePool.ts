import { EURC, USDC } from '@/config/tokens'
import type { Token } from '@/types/token'

export const COCO_STABLE_POOL_CHAIN_ID = 5_042_002
export const COCO_STABLE_POOL_ADDRESS = '0x0EA7A79F8864091ac7F2B8643BaA7598a9d05a83' as const
export const COCO_STABLE_LP_TOKEN_ADDRESS = '0xfE4A959c689019E09f584F25114Bb5A5e2aA8499' as const
export const COCO_STABLE_POOL_ARCSCAN_BASE_URL = 'https://testnet.arcscan.app/address'
export const COCO_STABLE_POOL_SAMPLE_QUOTE_INPUT = BigInt(100000)

export const COCO_STABLE_POOL_READ_ABI = [
  {
    type: 'function',
    name: 'getTokens',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '', type: 'address' },
      { name: '', type: 'address' },
    ],
  },
  {
    type: 'function',
    name: 'getBalances',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'balance0', type: 'uint256' },
      { name: 'balance1', type: 'uint256' },
    ],
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
    name: 'feeBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'amplificationParameter',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'paused',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'getAmountOut',
    stateMutability: 'view',
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export const COCO_STABLE_LP_READ_ABI = [
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
  status: 'Prototype'
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
  typeLabel: 'Stable-swap inspired prototype',
  status: 'Prototype',
  chainId: COCO_STABLE_POOL_CHAIN_ID,
  poolAddress: COCO_STABLE_POOL_ADDRESS,
  lpTokenAddress: COCO_STABLE_LP_TOKEN_ADDRESS,
  tokens: [USDC, EURC],
  feeBps: 4,
  feeLabel: '0.04%',
  amplificationParameter: 100,
  safetyLabels: ['Testnet only', 'Unaudited', 'Read-only display', 'Not routed yet'],
  docsPath: '/docs',
  poolArcscanUrl: `${COCO_STABLE_POOL_ARCSCAN_BASE_URL}/${COCO_STABLE_POOL_ADDRESS}`,
  lpTokenArcscanUrl: `${COCO_STABLE_POOL_ARCSCAN_BASE_URL}/${COCO_STABLE_LP_TOKEN_ADDRESS}`,
  fallback: {
    balance0: BigInt(1000000),
    balance1: BigInt(1000000),
    totalLpSupply: BigInt(1000000),
    paused: false,
    quoteUsdcToEurc: BigInt(99860),
    quoteEurcToUsdc: BigInt(99860),
  },
} as const
