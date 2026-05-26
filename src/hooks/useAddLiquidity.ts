import { ROUTER_ADDRESS } from '@/config/contracts'
import type { Token } from '@/types/token'

/**
 * Hook placeholder for adding liquidity to a pool.
 *
 * TODO: Implement when ROUTER_ADDRESS is set to a deployed contract.
 * This will use wagmi's useWriteContract to call:
 *   router.addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin, to, deadline)
 */
export function useAddLiquidity() {
  const isReady = !!ROUTER_ADDRESS

  const addLiquidity = async (_params: {
    tokenA: Token
    tokenB: Token
    amountA: bigint
    amountB: bigint
    amountAMin: bigint
    amountBMin: bigint
    deadline: number
  }) => {
    if (!ROUTER_ADDRESS) {
      console.warn('[useAddLiquidity] Router address not configured. Deploy contracts first.')
      return
    }
    // TODO: Implement actual addLiquidity transaction
    // 1. Approve tokenA for router
    // 2. Approve tokenB for router
    // 3. Call addLiquidity
    // 4. Wait for transaction receipt
  }

  return {
    addLiquidity,
    isReady,
    isPending: false,
    isSuccess: false,
    error: null as Error | null,
  }
}
