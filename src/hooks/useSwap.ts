import { ROUTER_ADDRESS } from '@/config/contracts'
import type { Token } from '@/types/token'

/**
 * Hook placeholder for executing token swaps.
 *
 * TODO: Implement when ROUTER_ADDRESS is set to a deployed contract.
 * This will use wagmi's useWriteContract to call:
 *   router.swapExactTokensForTokens(amountIn, amountOutMin, path, to, deadline)
 */
export function useSwap() {
  const isReady = !!ROUTER_ADDRESS

  const swap = async (_params: {
    tokenIn: Token
    tokenOut: Token
    amountIn: bigint
    amountOutMin: bigint
    deadline: number
  }) => {
    if (!ROUTER_ADDRESS) {
      console.warn('[useSwap] Router address not configured. Deploy contracts first.')
      return
    }
    // TODO: Implement actual swap transaction
    // 1. Check allowance, approve if needed
    // 2. Call swapExactTokensForTokens
    // 3. Wait for transaction receipt
    // 4. Return result
  }

  return {
    swap,
    isReady,
    isPending: false,
    isSuccess: false,
    error: null as Error | null,
  }
}
