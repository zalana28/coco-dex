import { ROUTER_ADDRESS } from '@/config/contracts'
import type { Token } from '@/types/token'

/**
 * Hook placeholder for removing liquidity from a pool.
 *
 * TODO: Implement when ROUTER_ADDRESS is set to a deployed contract.
 * This will use wagmi's useWriteContract to call:
 *   router.removeLiquidity(tokenA, tokenB, liquidity, amountAMin, amountBMin, to, deadline)
 */
export function useRemoveLiquidity() {
  const isReady = !!ROUTER_ADDRESS

  const removeLiquidity = async (_params: {
    tokenA: Token
    tokenB: Token
    liquidity: bigint
    amountAMin: bigint
    amountBMin: bigint
    deadline: number
  }) => {
    if (!ROUTER_ADDRESS) {
      console.warn('[useRemoveLiquidity] Router address not configured. Deploy contracts first.')
      return
    }
    // TODO: Implement actual removeLiquidity transaction
    // 1. Approve LP token for router
    // 2. Call removeLiquidity
    // 3. Wait for transaction receipt
  }

  return {
    removeLiquidity,
    isReady,
    isPending: false,
    isSuccess: false,
    error: null as Error | null,
  }
}
