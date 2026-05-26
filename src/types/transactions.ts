/**
 * Transaction progress types for Coco DEX.
 *
 * Used by the TransactionProgressPanel to display step-by-step
 * blockchain transaction status with tx hashes and explorer links.
 */

export type TransactionStatus =
  | 'idle'
  | 'waiting_wallet_confirmation'
  | 'submitted'
  | 'pending_onchain'
  | 'success'
  | 'failed'
  | 'rejected'

export type TransactionType =
  | 'approve_usdc'
  | 'approve_eurc'
  | 'swap'
  | 'add_liquidity'
  | 'remove_liquidity'

export interface TransactionStep {
  id: string
  type: TransactionType
  label: string
  status: TransactionStatus
  txHash?: `0x${string}`
  error?: string
  timestamp: number
}

export interface TransactionFlow {
  id: string
  steps: TransactionStep[]
  createdAt: number
}

/** Explorer base URL for Arc Testnet */
export const ARC_EXPLORER_URL = 'https://testnet.arcscan.app'

/** Build explorer link for a transaction hash */
export function getExplorerTxUrl(txHash: string): string {
  return `${ARC_EXPLORER_URL}/tx/${txHash}`
}

/** Truncate a tx hash for display: 0xabc1...1234 */
export function truncateTxHash(hash: string, start = 6, end = 4): string {
  if (hash.length <= start + end) return hash
  return `${hash.slice(0, start)}...${hash.slice(-end)}`
}

/** Human-readable labels for transaction types */
export const TX_TYPE_LABELS: Record<TransactionType, string> = {
  approve_usdc: 'Approve USDC',
  approve_eurc: 'Approve EURC',
  swap: 'Swap',
  add_liquidity: 'Add Liquidity',
  remove_liquidity: 'Remove Liquidity',
}

/** Status copy per transaction type and status */
export function getStatusMessage(type: TransactionType, status: TransactionStatus): string {
  const labels: Record<TransactionType, Record<TransactionStatus, string>> = {
    approve_usdc: {
      idle: '',
      waiting_wallet_confirmation: 'Waiting for wallet confirmation',
      submitted: 'Approval submitted',
      pending_onchain: 'Approving USDC on Arc Testnet',
      success: 'USDC approval complete',
      failed: 'Approval failed',
      rejected: 'Approval rejected',
    },
    approve_eurc: {
      idle: '',
      waiting_wallet_confirmation: 'Waiting for wallet confirmation',
      submitted: 'Approval submitted',
      pending_onchain: 'Approving EURC on Arc Testnet',
      success: 'EURC approval complete',
      failed: 'Approval failed',
      rejected: 'Approval rejected',
    },
    swap: {
      idle: '',
      waiting_wallet_confirmation: 'Waiting for wallet confirmation',
      submitted: 'Swap submitted',
      pending_onchain: 'Swapping on Arc Testnet',
      success: 'Swap complete',
      failed: 'Swap failed',
      rejected: 'Swap rejected',
    },
    add_liquidity: {
      idle: '',
      waiting_wallet_confirmation: 'Waiting for wallet confirmation',
      submitted: 'Supply submitted',
      pending_onchain: 'Adding liquidity on Arc Testnet',
      success: 'Liquidity added',
      failed: 'Supply failed',
      rejected: 'Supply rejected',
    },
    remove_liquidity: {
      idle: '',
      waiting_wallet_confirmation: 'Waiting for wallet confirmation',
      submitted: 'Removal submitted',
      pending_onchain: 'Removing liquidity on Arc Testnet',
      success: 'Liquidity removed',
      failed: 'Removal failed',
      rejected: 'Removal rejected',
    },
  }
  return labels[type]?.[status] ?? ''
}
