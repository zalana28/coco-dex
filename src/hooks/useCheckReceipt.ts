import { useCallback } from 'react'
import { getTransactionReceipt } from '@wagmi/core'
import { wagmiConfig } from '@/config/wagmi'

/**
 * Hook for manually checking transaction receipt status via RPC.
 *
 * Uses wagmi/core's getTransactionReceipt which goes through the
 * configured transport (Arc Testnet RPC). This is the "Check Status"
 * button's source of truth — independent of hook-based polling.
 *
 * Returns:
 * - 'success' if receipt.status === 'success'
 * - 'reverted' if receipt.status === 'reverted'
 * - 'pending' if the receipt is not yet available
 * - 'error' if the RPC call fails
 */
export type ReceiptStatus = 'success' | 'reverted' | 'pending' | 'error'

export function useCheckReceipt() {
  const checkReceipt = useCallback(async (txHash: `0x${string}`): Promise<ReceiptStatus> => {
    try {
      const receipt = await getTransactionReceipt(wagmiConfig, { hash: txHash })
      if (receipt.status === 'success') return 'success'
      if (receipt.status === 'reverted') return 'reverted'
      return 'pending'
    } catch (err: unknown) {
      // If the receipt is not found yet (tx still pending), viem throws
      const message = err instanceof Error ? err.message : String(err)
      if (
        message.includes('could not be found') ||
        message.includes('not found') ||
        message.includes('null')
      ) {
        return 'pending'
      }
      return 'error'
    }
  }, [])

  return { checkReceipt }
}
