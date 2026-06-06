import { EURC, USDC } from '@/config/tokens'
import type { Token } from '@/types/token'

export const COCO_STABLE_POOL_CHAIN_ID = 5_042_002
export const COCO_STABLE_POOL_ADDRESS = '0x0EA7A79F8864091ac7F2B8643BaA7598a9d05a83' as const
export const COCO_STABLE_LP_TOKEN_ADDRESS = '0xfE4A959c689019E09f584F25114Bb5A5e2aA8499' as const
export const COCO_STABLE_LP_DECIMALS = 6
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
  fallback: {
    balance0: BigInt(1000000),
    balance1: BigInt(1000000),
    totalLpSupply: BigInt(1000000),
    paused: false,
    quoteUsdcToEurc: BigInt(99860),
    quoteEurcToUsdc: BigInt(99860),
  },
} as const
