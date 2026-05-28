import { ROUTER_ADDRESS, USDC_EURC_PAIR_ADDRESS } from '@/config/contracts'
import { USDC } from '@/config/tokens'
import type { Token } from '@/types/token'
import { formatTokenAmount } from '@/utils/format'
import { calculateMinimumReceived, getAmountOut } from '@/utils/price'
import type { RouteQuote } from './types'

type GetCocoQuoteParams = {
  tokenIn: Token
  tokenOut: Token
  amountIn: bigint
  reserveUsdc?: bigint
  reserveEurc?: bigint
  slippageBps: number
}

export function getCocoRouteQuote({
  tokenIn,
  tokenOut,
  amountIn,
  reserveUsdc,
  reserveEurc,
  slippageBps,
}: GetCocoQuoteParams): RouteQuote | undefined {
  if (amountIn <= BigInt(0) || !reserveUsdc || !reserveEurc) return undefined

  const isFromUsdc = tokenIn.address.toLowerCase() === USDC.address.toLowerCase()
  const reserveIn = isFromUsdc ? reserveUsdc : reserveEurc
  const reserveOut = isFromUsdc ? reserveEurc : reserveUsdc
  const amountOut = getAmountOut(amountIn, reserveIn, reserveOut)

  if (amountOut <= BigInt(0)) return undefined

  return {
    id: 'coco-usdc-eurc',
    source: 'coco',
    label: 'Coco',
    amountIn,
    amountOut,
    amountOutFormatted: formatTokenAmount(amountOut, tokenOut.decimals),
    minAmountOut: calculateMinimumReceived(amountOut, slippageBps),
    routePath: [tokenIn.symbol, tokenOut.symbol],
    routerAddress: ROUTER_ADDRESS,
    poolAddress: USDC_EURC_PAIR_ADDRESS,
    isExecutable: true,
  }
}
