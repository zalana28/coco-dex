import { CheckCircle, XCircle, Loader2, Clock, Copy, ExternalLink, X, RefreshCw } from 'lucide-react'
import type { TransactionFlow, TransactionStep, TransactionStatus } from '@/types/transactions'
import { getExplorerTxUrl, truncateTxHash, getStatusMessage } from '@/types/transactions'
import { useState } from 'react'

interface TransactionProgressPanelProps {
  currentFlow: TransactionFlow | null
  history: TransactionFlow[]
  onClear: () => void
  onCheckStatus?: () => void
}

/**
 * Transaction progress panel displayed below Swap/Add Liquidity cards.
 * Shows step-by-step transaction status, tx hashes, and explorer links.
 *
 * Rules enforced by this panel:
 * - Only the active step shows a spinner.
 * - Future steps show as idle (empty circle).
 * - Past steps show success/failed checkmarks.
 * - Each step's tx hash is displayed only for that step.
 */
export function TransactionProgressPanel({ currentFlow, history, onClear, onCheckStatus }: TransactionProgressPanelProps) {
  if (!currentFlow && history.length === 0) return null

  return (
    <div className="w-full max-w-[480px] mt-4 space-y-3">
      {/* Current Flow */}
      {currentFlow && (
        <div className="rounded-2xl bg-coco-dark-surface/80 backdrop-blur-sm border border-coco-dark-border p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-coco-dark-muted uppercase tracking-wider">Transaction Progress</span>
            <div className="flex items-center gap-1">
              {onCheckStatus && (
                <button
                  onClick={onCheckStatus}
                  className="p-1 rounded-md text-coco-dark-muted hover:text-coco-teal-400 hover:bg-coco-dark-bg transition-colors"
                  title="Check status"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={onClear}
                className="p-1 rounded-md text-coco-dark-muted hover:text-coco-dark-text hover:bg-coco-dark-bg transition-colors"
                title="Clear"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {currentFlow.steps.map((step, idx) => (
              <StepRow key={step.id} step={step} stepNumber={idx + 1} />
            ))}
          </div>
        </div>
      )}

      {/* History (latest 3) */}
      {history.length > 0 && !currentFlow && (
        <div className="rounded-2xl bg-coco-dark-surface/60 backdrop-blur-sm border border-coco-dark-border p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-coco-dark-muted uppercase tracking-wider">Recent Transactions</span>
            <button
              onClick={onClear}
              className="p-1 rounded-md text-coco-dark-muted hover:text-coco-dark-text hover:bg-coco-dark-bg transition-colors"
              title="Clear history"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="space-y-2">
            {history.map((flow) => (
              <HistoryRow key={flow.id} flow={flow} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StepRow({ step, stepNumber }: { step: TransactionStep; stepNumber: number }) {
  const message = getStatusMessage(step.type, step.status)

  return (
    <div className={`flex items-start gap-3 rounded-xl p-3 transition-colors ${
      step.status === 'success' ? 'bg-coco-green-500/5' :
      step.status === 'failed' || step.status === 'rejected' ? 'bg-coco-red-500/5' :
      step.status === 'idle' ? 'bg-transparent' :
      'bg-coco-dark-bg/50'
    }`}>
      {/* Status icon */}
      <div className="shrink-0 mt-0.5">
        <StatusIcon status={step.status} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-coco-dark-muted">Step {stepNumber}</span>
          <span className="text-sm font-medium text-coco-dark-text">{step.label}</span>
        </div>

        {message && step.status !== 'idle' && (
          <p className={`text-xs mt-0.5 ${
            step.status === 'success' ? 'text-coco-green-500' :
            step.status === 'failed' || step.status === 'rejected' ? 'text-coco-red-500' :
            'text-coco-dark-muted'
          }`}>
            {message}
          </p>
        )}

        {step.error && (
          <p className="text-[11px] text-coco-red-500/80 mt-0.5 truncate">{step.error}</p>
        )}

        {/* Tx hash with copy + explorer link */}
        {step.txHash && (
          <TxHashDisplay txHash={step.txHash} />
        )}
      </div>
    </div>
  )
}

function TxHashDisplay({ txHash }: { txHash: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(txHash)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-2 mt-1.5">
      <span className="text-[11px] font-mono text-coco-dark-muted">
        {truncateTxHash(txHash)}
      </span>
      <button
        onClick={handleCopy}
        className="p-0.5 rounded text-coco-dark-muted hover:text-coco-teal-400 transition-colors"
        title={copied ? 'Copied!' : 'Copy tx hash'}
      >
        <Copy className="h-3 w-3" />
      </button>
      <a
        href={getExplorerTxUrl(txHash)}
        target="_blank"
        rel="noopener noreferrer"
        className="p-0.5 rounded text-coco-dark-muted hover:text-coco-teal-400 transition-colors"
        title="View on Explorer"
      >
        <ExternalLink className="h-3 w-3" />
      </a>
      {copied && <span className="text-[10px] text-coco-teal-400">Copied</span>}
    </div>
  )
}

function HistoryRow({ flow }: { flow: TransactionFlow }) {
  const lastStep = flow.steps[flow.steps.length - 1]
  if (!lastStep) return null

  const allSuccess = flow.steps.every((s) => s.status === 'success')
  const hasFailed = flow.steps.some((s) => s.status === 'failed' || s.status === 'rejected')
  const label = flow.steps.map((s) => s.label).join(' → ')
  const txHash = lastStep.txHash

  const timeAgo = formatTimeAgo(flow.createdAt)

  return (
    <div className="flex items-center gap-3 rounded-lg p-2 hover:bg-coco-dark-bg/30 transition-colors">
      <div className="shrink-0">
        {allSuccess ? (
          <CheckCircle className="h-4 w-4 text-coco-green-500" />
        ) : hasFailed ? (
          <XCircle className="h-4 w-4 text-coco-red-500" />
        ) : (
          <Clock className="h-4 w-4 text-coco-dark-muted" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs text-coco-dark-text truncate">{label}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {txHash && (
            <a
              href={getExplorerTxUrl(txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-mono text-coco-teal-400 hover:text-coco-teal-600 transition-colors"
            >
              {truncateTxHash(txHash)}
            </a>
          )}
          <span className="text-[10px] text-coco-dark-muted">{timeAgo}</span>
        </div>
      </div>

      <div className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
        allSuccess ? 'bg-coco-green-500/10 text-coco-green-500' :
        hasFailed ? 'bg-coco-red-500/10 text-coco-red-500' :
        'bg-coco-dark-border text-coco-dark-muted'
      }`}>
        {allSuccess ? 'Success' : hasFailed ? 'Failed' : 'Pending'}
      </div>
    </div>
  )
}

function StatusIcon({ status }: { status: TransactionStatus }) {
  switch (status) {
    case 'idle':
      return <div className="h-4 w-4 rounded-full border-2 border-coco-dark-border" />
    case 'waiting_wallet_confirmation':
      return <Loader2 className="h-4 w-4 text-coco-amber-500 animate-spin" />
    case 'submitted':
    case 'pending_onchain':
      return <Loader2 className="h-4 w-4 text-coco-teal-400 animate-spin" />
    case 'success':
      return <CheckCircle className="h-4 w-4 text-coco-green-500" />
    case 'failed':
    case 'rejected':
      return <XCircle className="h-4 w-4 text-coco-red-500" />
    default:
      return <div className="h-4 w-4 rounded-full border-2 border-coco-dark-border" />
  }
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}
