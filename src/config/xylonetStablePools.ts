import { EURC, USDC } from '@/config/tokens'
import type { Token } from '@/types/token'

export const XYLONET_ARCSCAN_BASE_URL = 'https://testnet.arcscan.app/address'
export const XYLONET_APP_POOLS_URL = 'https://www.xylonet.xyz/pools'
export const XYLONET_SWAP_FEE_BPS = 4
export const XYLONET_SWAP_FEE_LABEL = '0.04%'
export const XYLONET_STABLESWAP_AMPLIFICATION = 100

export const XYLONET_STABLE_POOL_ABI = [
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

export const ERC20_BALANCE_READ_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export type XyloNetStablePoolMetadata = {
  id: string
  source: 'XyloNet'
  type: 'StableSwap'
  pairLabel: string
  address: `0x${string}`
  tokens: readonly [Token, Token]
  feeLabel: string
  feeBps: number
  amplification: number
  xylonetUrl: string
  arcscanUrl: string
}

export const XYLONET_USDC_EURC_STABLE_POOL: XyloNetStablePoolMetadata = {
  id: 'xylonet-usdc-eurc-stable',
  source: 'XyloNet',
  type: 'StableSwap',
  pairLabel: 'USDC/EURC',
  address: '0x3DF3966F5138143dce7a9cFDdC2c0310ce083BB1',
  tokens: [USDC, EURC],
  feeLabel: XYLONET_SWAP_FEE_LABEL,
  feeBps: XYLONET_SWAP_FEE_BPS,
  amplification: XYLONET_STABLESWAP_AMPLIFICATION,
  xylonetUrl: XYLONET_APP_POOLS_URL,
  arcscanUrl: `${XYLONET_ARCSCAN_BASE_URL}/0x3DF3966F5138143dce7a9cFDdC2c0310ce083BB1`,
} as const
