import { useState, useCallback } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { ERC20_ABI } from '@/config/abis'
import type { Token } from '@/types/token'

/**
 * Hook for ERC-20 token approval flow.
 *
 * Manages the full approval lifecycle:
 * 1. Check current allowance
 * 2. Determine if approval is needed
 * 3. Send approve transaction
 * 4. Wait for confirmation via receipt polling
 *
 * All amounts use ERC-20 decimals (6 for USDC/EURC on Arc).
 * NEVER pass native 18-decimal values to this hook.
 *
 * The tx hash is exposed so callers can track progress independently.
 */
export function useApprove(
  token: Token | undefined,
  spender: `0x${string}` | undefined,
  amount: bigint = BigInt(0)
) {
  const { address } = useAccount()
  const [approvalTxHash, setApprovalTxHash] = useState<`0x${string}` | undefined>()

  // Read current allowance
  const { data: currentAllowance, refetch: refetchAllowance } = useReadContract({
    address: token?.address as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && spender ? [address, spender] : undefined,
    query: {
      enabled: !!token && !!address && !!spender,
    },
  })

  // Write contract for approval
  const {
    writeContract,
    isPending: isApproving,
    error: approveError,
    reset: resetWrite,
  } = useWriteContract()

  // Wait for approval tx receipt
  const {
    isLoading: isWaitingForReceipt,
    isSuccess: isApproved,
    data: approvalReceipt,
  } = useWaitForTransactionReceipt({
    hash: approvalTxHash,
    query: {
      enabled: !!approvalTxHash,
    },
  })

  const allowance = (currentAllowance as bigint) ?? BigInt(0)
  const needsApproval = amount > BigInt(0) && allowance < amount

  /**
   * Whether the approval receipt indicates a reverted transaction.
   */
  const isReverted = approvalReceipt?.status === 'reverted'

  /**
   * Send approval transaction.
   * Approves the exact amount needed (not unlimited) for safety.
   * Returns the tx hash via the onHash callback if provided.
   */
  const approve = useCallback((onHash?: (hash: `0x${string}`) => void) => {
    if (!token || !spender || !address) {
      console.warn('[useApprove] Missing token, spender, or address')
      return
    }

    if (!needsApproval) {
      console.warn('[useApprove] Approval not needed — allowance is sufficient')
      return
    }

    writeContract(
      {
        address: token.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [spender, amount],
      },
      {
        onSuccess: (hash) => {
          setApprovalTxHash(hash)
          onHash?.(hash)
        },
      }
    )
  }, [token, spender, address, amount, needsApproval, writeContract])

  /**
   * Reset the approval state so a new approval can be initiated.
   * Call this when switching tokens or clearing the flow.
   */
  const resetApproval = useCallback(() => {
    setApprovalTxHash(undefined)
    resetWrite()
  }, [resetWrite])

  return {
    /** Current allowance (bigint, 6 decimals for USDC/EURC) */
    allowance,
    /** Whether the current allowance is less than the required amount */
    needsApproval,
    /** Send exact-amount approval tx. Optional onHash callback for immediate hash capture. */
    approve,
    /** Approval tx is being signed/sent */
    isApproving,
    /** Waiting for approval tx to be mined */
    isWaitingForReceipt,
    /** Approval tx confirmed successfully */
    isApproved,
    /** Approval receipt indicates revert */
    isReverted,
    /** The approval tx hash (source of truth for tracking) */
    approvalTxHash,
    /** Error from the approval transaction */
    error: approveError,
    /** Refetch the allowance (call after approval confirms) */
    refetchAllowance,
    /** Reset approval state for new flow */
    resetApproval,
  }
}
