import { CheckCircle, XCircle, Loader2, Info, X } from 'lucide-react'
import type { Toast, ToastType } from '@/hooks/useToast'

interface ToastContainerProps {
  toasts: Toast[]
  onDismiss: (id: string) => void
}

const iconMap: Record<ToastType, React.ReactNode> = {
  pending: <Loader2 className="h-5 w-5 text-coco-amber-500 animate-spin" />,
  success: <CheckCircle className="h-5 w-5 text-coco-green-500" />,
  error: <XCircle className="h-5 w-5 text-coco-red-500" />,
  info: <Info className="h-5 w-5 text-coco-teal-400" />,
}

const borderColorMap: Record<ToastType, string> = {
  pending: 'border-l-coco-amber-500',
  success: 'border-l-coco-green-500',
  error: 'border-l-coco-red-500',
  info: 'border-l-coco-teal-400',
}

/**
 * Toast notification container.
 * Renders in the top-right corner, stacking vertically.
 *
 * Usage: Place once in your app layout and pass toasts from useToast().
 */
export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed top-20 right-4 z-[100] flex flex-col gap-2 w-80">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const explorerUrl = toast.txHash
    ? `https://testnet.arcscan.app/tx/${toast.txHash}`
    : undefined

  return (
    <div
      className={`
        flex items-start gap-3 p-3.5 rounded-xl
        bg-coco-dark-surface border border-coco-dark-border
        border-l-4 ${borderColorMap[toast.type]}
        shadow-coco-2 animate-in slide-in-from-right
      `}
    >
      <div className="shrink-0 mt-0.5">{iconMap[toast.type]}</div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-coco-dark-text truncate">
          {toast.title}
        </p>
        {toast.message && (
          <p className="text-xs text-coco-dark-muted mt-0.5">{toast.message}</p>
        )}
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-coco-teal-400 hover:text-coco-teal-600 mt-1 inline-block"
          >
            View on Explorer
          </a>
        )}
      </div>

      <button
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 p-0.5 rounded text-coco-dark-muted hover:text-coco-dark-text transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
