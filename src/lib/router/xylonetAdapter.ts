import { EXTERNAL_DEXES } from '@/config/externalDexes'
import { EURC, USDC } from '@/config/tokens'
import type { Token } from '@/types/token'
import { formatTokenAmount } from '@/utils/format'
import { calculateMinimumReceived } from '@/utils/price'
import type { RouteQuote } from './types'

export const XYLONET_ROUTER_ABI = [
  {
    type: 'function',
    name: 'getAmountOut',
    stateMutability: 'view',
    inputs: [
      { name: 'pool', type: 'address' },
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'swap',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'pool', type: 'address' },
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'minAmountOut', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export function isXyloNetPairSupported(tokenIn: Token, tokenOut: Token): boolean {
  const tokenInAddress = tokenIn.address.toLowerCase()
  const tokenOutAddress = tokenOut.address.toLowerCase()
  const usdcAddress = USDC.address.toLowerCase()
  const eurcAddress = EURC.address.toLowerCase()

  return (
    (tokenInAddress === usdcAddress && tokenOutAddress === eurcAddress) ||
    (tokenInAddress === eurcAddress && tokenOutAddress === usdcAddress)
  )
}

type BuildXyloNetQuoteParams = {
  tokenIn: Token
  tokenOut: Token
  amountIn: bigint
  amountOut?: bigint
  slippageBps: number
}

export function buildXyloNetRouteQuote({
  tokenIn,
  tokenOut,
  amountIn,
  amountOut,
  slippageBps,
}: BuildXyloNetQuoteParams): RouteQuote | undefined {
  if (!amountOut || amountIn <= BigInt(0) || amountOut <= BigInt(0) || !isXyloNetPairSupported(tokenIn, tokenOut)) {
    return undefined
  }

  const xylonet = EXTERNAL_DEXES.xylonet

  return {
    id: 'xylonet-usdc-eurc',
    source: 'xylonet',
    label: xylonet.label,
    amountIn,
    amountOut,
    amountOutFormatted: formatTokenAmount(amountOut, tokenOut.decimals),
    minAmountOut: calculateMinimumReceived(amountOut, slippageBps),
    routePath: [tokenIn.symbol, tokenOut.symbol],
    routerAddress: xylonet.routerAddress,
    poolAddress: xylonet.usdcEurcPoolAddress,
    isExecutable: false,
    warning: 'Quote available, execution coming soon.',
  }
}
