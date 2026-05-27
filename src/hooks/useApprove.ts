import { useState, useCallback } from 'react'
import { useAccount, useChainId, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { ERC20_ABI } from '@/config/abis'
import { arcTestnet } from '@/config/chains'
import type { Token } from '@/types/token'

const ARC_CHAIN_ID = arcTestnet.id

/**
 * Hook for ERC-20 token approval flow with network guard.
 *
 * Hard guard: refuses to execute writeContract if chainId !== 5042002.
 * Passes explicit chainId to writeContract to prevent accidental cross-chain writes.
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
  const chainId = useChainId()
  const [approvalTxHash, setApprovalTxHash] = useState<`0x${string}` | undefined>()

  // Read current allowance — target Arc Testnet explicitly
  const { data: currentAllowance, refetch: refetchAllowance } = useReadContract({
    address: token?.address as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && spender ? [address, spender] : undefined,
    chainId: ARC_CHAIN_ID,
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
   * HARD GUARD: Returns 'WRONG_NETWORK' if not on Arc Testnet.
   * Approves the exact amount needed (not unlimited) for safety.
   * Returns the tx hash via the onHash callback if provided.
   */
  const approve = useCallback((onHash?: (hash: `0x${string}`) => void): 'WRONG_NETWORK' | undefined => {
    // ─── Network guard: refuse execution on wrong chain ───
    if (chainId !== ARC_CHAIN_ID) {
      console.warn('[useApprove] BLOCKED: wallet is on wrong network', chainId)
      return 'WRONG_NETWORK'
    }

    if (!token || !spender || !address) {
      console.warn('[useApprove] Missing token, spender, or address')
      return undefined
    }

    if (!needsApproval) {
      console.warn('[useApprove] Approval not needed — allowance is sufficient')
      return undefined
    }

    writeContract(
      {
        address: token.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [spender, amount],
        chainId: ARC_CHAIN_ID, // Explicit chain target
      },
      {
        onSuccess: (hash) => {
          setApprovalTxHash(hash)
          onHash?.(hash)
        },
      }
    )
    return undefined
  }, [token, spender, address, amount, needsApproval, writeContract, chainId])

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
