import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAccount, useChainId, usePublicClient, useWriteContract } from 'wagmi'
import { AlertTriangle, MinusCircle, RefreshCw } from 'lucide-react'
import { TransactionProgressPanel } from '@/components/transactions/TransactionProgressPanel'
import {
  COCO_STABLE_POOL,
  COCO_STABLE_POOL_REMOVE_LIQUIDITY_ABI,
} from '@/config/cocoStablePool'
import { arcTestnet } from '@/config/chains'
import { useTokenBalance } from '@/hooks/useTokenBalance'
import { useTransactionProgress } from '@/hooks/useTransactionProgress'
import { formatTokenAmount, parseTokenAmount, truncateAddress } from '@/utils/format'
import { sanitizeTokenInput, validateTokenAmount } from '@/utils/validation'
import type { TransactionType } from '@/types/transactions'

const ARC_CHAIN_ID = arcTestnet.id
const RECEIPT_TIMEOUT_MS = 120_000
const RECEIPT_BACKOFF_MS = [3_000, 5_000, 8_000, 13_000, 15_000] as const
const RATE_LIMIT_COPY = 'Arc Testnet RPC is rate-limited. Please wait a minute, then click Check status or try again.'
const RATE_LIMIT_RETRY_COPY = 'Arc Testnet RPC is rate-limited. Waiting before retrying...'
const MANUAL_RATE_LIMIT_COPY = 'Arc Testnet RPC is rate-limited. Wait a moment and try Check status again.'
const DEFAULT_SLIPPAGE_BPS = 50
const REMOVE_SIMULATION_REVERT_COPY = 'Remove liquidity simulation reverted. Check min outputs and pool state.'
const SLIPPAGE_PRESETS = [
  { label: '0.1%', bps: 10 },
  { label: '0.5%', bps: 50 },
  { label: '1.0%', bps: 100 },
] as const

type ReceiptResult = 'success' | 'reverted' | 'timeout' | 'not_found' | 'rate_limited'

type ActionState = {
  action: 'connect' | 'wrong-network' | 'paused' | 'enter' | 'estimate-unavailable' | 'insufficient-lp' | 'remove' | 'pending' | 'success' | 'failed' | 'rejected'
  label: string
  disabled: boolean
}

function applySlippage(rawAmount: bigint, slippageBps: number) {
  const safeBps = BigInt(Math.min(10_000, Math.max(0, Math.trunc(slippageBps))))
  return (rawAmount * (10_000n - safeBps)) / 10_000n
}

function isUserRejected(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return message.includes('rejected') || message.includes('denied') || message.includes('cancelled') || message.includes('canceled')
}

function isRateLimitError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('429') || /rate.?limit/i.test(message) || /too many requests/i.test(message)
}

function getFriendlyErrorMessage(error: unknown) {
  if (isUserRejected(error)) return 'Rejected by user'
  if (isRateLimitError(error)) return RATE_LIMIT_COPY
  return error instanceof Error ? error.message : String(error)
}

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function estimateRemoveOut({
  lpAmount,
  reserve0,
  reserve1,
  totalSupply,
}: {
  lpAmount: bigint
  reserve0: bigint
  reserve1: bigint
  totalSupply: bigint
}) {
  if (lpAmount <= BigInt(0) || totalSupply <= BigInt(0)) {
    return { amount0: BigInt(0), amount1: BigInt(0), available: false }
  }

  return {
    amount0: (lpAmount * reserve0) / totalSupply,
    amount1: (lpAmount * reserve1) / totalSupply,
    available: true,
  }
}

function formatInputAmount(rawAmount: bigint, decimals: number) {
  const divisor = BigInt(10) ** BigInt(decimals)
  const whole = rawAmount / divisor
  const fraction = rawAmount % divisor
  const fractionStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '')
  return fractionStr ? `${whole}.${fractionStr}` : whole.toString()
}

function getErrorDetails(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

function getSimulationErrorSummary(error: unknown) {
  if (isRateLimitError(error)) return RATE_LIMIT_COPY
  if (isUserRejected(error)) return 'Rejected by user'
  return REMOVE_SIMULATION_REVERT_COPY
}

function RemoveLiquidityBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-blue-400/25 bg-blue-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-300">
      {children}
    </span>
  )
}

function RemoveInput({
  label,
  value,
  onChange,
  balance,
  error,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  balance: string
  error: string | null
}) {
  return (
    <label className="block rounded-xl border border-coco-dark-border bg-coco-dark-surface/70 p-3">
      <span className="text-xs text-coco-dark-muted">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full min-w-0 bg-transparent font-mono text-lg text-coco-dark-text outline-none placeholder:text-coco-dark-border"
        placeholder="0.0"
      />
      <span className="mt-1 block truncate text-[11px] text-coco-dark-muted">{balance}</span>
      {error && <span className="mt-1 block text-[11px] text-coco-red-500">{error}</span>}
    </label>
  )
}

function SlippageSelector({
  valueBps,
  onChange,
}: {
  valueBps: number
  onChange: (nextValueBps: number) => void
}) {
  return (
    <div className="rounded-xl border border-coco-dark-border bg-coco-dark-surface/55 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs text-coco-dark-muted">Slippage tolerance</p>
          <p className="mt-1 text-xs text-coco-dark-text">{(valueBps / 100).toFixed(1)}%</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {SLIPPAGE_PRESETS.map((preset) => (
            <button
              key={preset.bps}
              type="button"
              onClick={() => onChange(preset.bps)}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                valueBps === preset.bps
                  ? 'border-blue-400/35 bg-blue-400/15 text-blue-300'
                  : 'border-coco-dark-border bg-coco-dark-bg/70 text-coco-dark-muted hover:border-blue-400/25 hover:text-coco-dark-text'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
      {valueBps > 200 && (
        <p className="mt-2 rounded-lg border border-coco-amber-500/20 bg-coco-amber-500/10 px-3 py-2 text-xs text-coco-amber-500">
          High slippage. Use tiny test amounts only.
        </p>
      )}
    </div>
  )
}

function RemoveMetric({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-coco-dark-muted">{label}</p>
      <p className={`mt-1 truncate text-sm font-medium text-coco-dark-text ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}

export function CocoStableRemoveLiquidityPanel({
  reserve0,
  reserve1,
  totalSupply,
  userLpBalance,
  lpDecimals,
  paused,
  onRefreshPool,
  onPendingChange,
}: {
  reserve0: bigint
  reserve1: bigint
  totalSupply: bigint
  userLpBalance: bigint | undefined
  lpDecimals: number
  paused: boolean
  onRefreshPool: () => void
  /**
   * Reports whether a real wallet confirmation/broadcast is actively in flight.
   * The parent modal blocks its close paths only while this is true, so the
   * user can always escape every non-pending state (estimate unavailable,
   * insufficient cSLP, rejected, failed, success, idle).
   */
  onPendingChange?: (isPending: boolean) => void
}) {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID })
  const [lpAmountInput, setLpAmountInput] = useState('')
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS)
  const [txError, setTxError] = useState<string | null>(null)
  const [txErrorDetails, setTxErrorDetails] = useState<string | null>(null)
  const [lastSuccessHash, setLastSuccessHash] = useState<`0x${string}`>()
  const [removeLiquidityConfirmed, setRemoveLiquidityConfirmed] = useState(false)
  const [timedOutSteps, setTimedOutSteps] = useState<Partial<Record<TransactionType, boolean>>>({})
  const [isCheckingStatus, setIsCheckingStatus] = useState(false)
  const poolRefreshInFlightRef = useRef(false)
  const tokenRefreshInFlightRef = useRef(false)
  const receiptPollInFlightRef = useRef<Partial<Record<string, Promise<ReceiptResult>>>>({})
  const txProgress = useTransactionProgress()
  const [token0, token1] = COCO_STABLE_POOL.tokens
  const { writeContract, isPending: isWalletPending } = useWriteContract()
  const token0Balance = useTokenBalance(token0, address)
  const token1Balance = useTokenBalance(token1, address)

  const lpAmountValidation = validateTokenAmount(lpAmountInput, lpDecimals, { allowTrailingDot: false })
  const lpAmountRaw = lpAmountValidation.valid ? parseTokenAmount(lpAmountInput, lpDecimals) : BigInt(0)
  const activeStep = txProgress.activeStep
  const activeTxHash = activeStep?.txHash
  const isStepConfirming = activeStep?.status === 'submitted' || activeStep?.status === 'pending_onchain'
  const isStepWaitingForWallet = activeStep?.status === 'waiting_wallet_confirmation'
  const activeStepTimedOut = activeStep?.type ? timedOutSteps[activeStep.type] === true : false
  const showRecovery = !!activeTxHash && isStepConfirming

  // Active wallet confirmation/broadcast = the only state in which the parent
  // modal is allowed to block its close paths. Everything else (estimate
  // unavailable, insufficient cSLP, rejected, failed, success, idle) must stay
  // closable so the user is never trapped.
  const isTransactionPending = isWalletPending || isStepWaitingForWallet || isStepConfirming
  useEffect(() => {
    onPendingChange?.(isTransactionPending)
  }, [isTransactionPending, onPendingChange])
  // Ensure the parent is not left in a "pending" lock if this panel unmounts
  // mid-flight (e.g. modal force-closed). Reset on unmount only.
  useEffect(() => {
    return () => onPendingChange?.(false)
  }, [onPendingChange])
  const expectedOut = useMemo(() => estimateRemoveOut({
    lpAmount: lpAmountRaw,
    reserve0,
    reserve1,
    totalSupply,
  }), [lpAmountRaw, reserve0, reserve1, totalSupply])
  const hasExpectedOut = lpAmountValidation.valid && expectedOut.available && expectedOut.amount0 > BigInt(0) && expectedOut.amount1 > BigInt(0)
  const minAmount0Raw = hasExpectedOut ? applySlippage(expectedOut.amount0, slippageBps) : BigInt(0)
  const minAmount1Raw = hasExpectedOut ? applySlippage(expectedOut.amount1, slippageBps) : BigInt(0)

  const handleLpAmountChange = (value: string) => {
    const sanitized = sanitizeTokenInput(value, lpDecimals)
    if (sanitized === null) return

    setRemoveLiquidityConfirmed(false)
    setTxError(null)
    setTxErrorDetails(null)
    setLpAmountInput(sanitized)
  }

  const setPercentAmount = (numerator: bigint, denominator: bigint) => {
    if (!userLpBalance || userLpBalance <= BigInt(0)) return
    const rawAmount = (userLpBalance * numerator) / denominator

    setRemoveLiquidityConfirmed(false)
    setTxError(null)
    setTxErrorDetails(null)
    setLpAmountInput(formatInputAmount(rawAmount, lpDecimals))
  }

  const refetchPoolState = useCallback(() => {
    if (poolRefreshInFlightRef.current) return

    poolRefreshInFlightRef.current = true
    onRefreshPool()
    window.setTimeout(() => {
      poolRefreshInFlightRef.current = false
    }, 1_000)
  }, [onRefreshPool])

  const refetchWalletTokenState = useCallback(async () => {
    if (tokenRefreshInFlightRef.current) return

    tokenRefreshInFlightRef.current = true
    try {
      await Promise.allSettled([
        token0Balance.refetch(),
        token1Balance.refetch(),
      ])
    } finally {
      tokenRefreshInFlightRef.current = false
    }
  }, [token0Balance, token1Balance])

  const refetchAfterReceiptSuccess = useCallback(() => {
    refetchPoolState()
    void refetchWalletTokenState()
  }, [refetchPoolState, refetchWalletTokenState])

  const getReceiptStatus = useCallback(async (txHash: `0x${string}`): Promise<ReceiptResult> => {
    if (!publicClient) return 'not_found'

    try {
      const receipt = await publicClient.getTransactionReceipt({ hash: txHash })
      return receipt.status === 'success' ? 'success' : 'reverted'
    } catch (error) {
      if (isRateLimitError(error)) return 'rate_limited'
      return 'not_found'
    }
  }, [publicClient])

  const waitForReceiptWithFallback = useCallback(async (txHash: `0x${string}`): Promise<ReceiptResult> => {
    if (!publicClient) return 'not_found'

    const existing = receiptPollInFlightRef.current[txHash]
    if (existing) return existing

    const pollPromise = (async () => {
      const startedAt = Date.now()
      let attempt = 0

      while (Date.now() - startedAt < RECEIPT_TIMEOUT_MS) {
        const waitMs = RECEIPT_BACKOFF_MS[Math.min(attempt, RECEIPT_BACKOFF_MS.length - 1)] ?? 15_000
        await delay(waitMs)

        const status = await getReceiptStatus(txHash)
        if (status === 'success' || status === 'reverted') return status

        if (status === 'rate_limited') {
          setTxError(RATE_LIMIT_RETRY_COPY)
          attempt += 2
          continue
        }

        attempt += 1
      }

      return 'timeout'
    })()

    receiptPollInFlightRef.current[txHash] = pollPromise
    try {
      return await pollPromise
    } finally {
      delete receiptPollInFlightRef.current[txHash]
    }
  }, [getReceiptStatus, publicClient])

  const markRemoveSuccessFromChain = useCallback((txHash: `0x${string}`) => {
    setRemoveLiquidityConfirmed(true)
    setLastSuccessHash(txHash)
    refetchAfterReceiptSuccess()
    setTimedOutSteps((prev) => ({ ...prev, remove_liquidity: false }))
    txProgress.markSuccess('remove_liquidity')
  }, [refetchAfterReceiptSuccess, txProgress])

  const monitorTransaction = useCallback(async (txHash: `0x${string}`) => {
    setTimedOutSteps((prev) => ({ ...prev, remove_liquidity: false }))
    const receiptStatus = await waitForReceiptWithFallback(txHash)

    if (receiptStatus === 'success') {
      markRemoveSuccessFromChain(txHash)
      return
    }

    if (receiptStatus === 'reverted') {
      setTxError('Transaction reverted')
      txProgress.markFailed('remove_liquidity', 'Transaction reverted')
      return
    }

    if (receiptStatus === 'rate_limited') {
      setTxError(RATE_LIMIT_COPY)
    }

    setTimedOutSteps((prev) => ({ ...prev, remove_liquidity: true }))
  }, [markRemoveSuccessFromChain, txProgress, waitForReceiptWithFallback])

  const ensureFlow = useCallback(() => {
    if (txProgress.currentFlow && !txProgress.isFlowComplete) return
    txProgress.startFlow([{ type: 'remove_liquidity', label: 'Remove Liquidity' }])
  }, [txProgress])

  const actionState: ActionState = useMemo(() => {
    if (!isConnected || !address) return { action: 'connect', label: 'Connect Wallet', disabled: true }
    if (chainId !== ARC_CHAIN_ID) return { action: 'wrong-network', label: 'Wrong Network', disabled: true }
    if (paused) return { action: 'paused', label: 'Pool Paused', disabled: true }
    if (!lpAmountValidation.valid) return { action: 'enter', label: lpAmountValidation.error ? 'Enter cSLP amount' : 'Enter Amounts', disabled: true }
    if (!hasExpectedOut) return { action: 'estimate-unavailable', label: 'Output estimate unavailable', disabled: true }
    if (userLpBalance !== undefined && lpAmountRaw > userLpBalance) return { action: 'insufficient-lp', label: 'Insufficient cSLP', disabled: true }
    if (isWalletPending || isStepWaitingForWallet) return { action: 'pending', label: 'Waiting for wallet', disabled: true }
    if (isStepConfirming) return { action: 'pending', label: 'Removing Liquidity', disabled: true }
    if (removeLiquidityConfirmed) return { action: 'success', label: 'Success', disabled: true }
    if (txError === 'Rejected by user') return { action: 'rejected', label: 'Rejected by user', disabled: false }
    if (txProgress.hasError) return { action: 'failed', label: 'Failed - retry', disabled: false }
    return { action: 'remove', label: 'Remove Liquidity', disabled: false }
  }, [
    isConnected,
    address,
    chainId,
    paused,
    lpAmountValidation,
    hasExpectedOut,
    userLpBalance,
    lpAmountRaw,
    isWalletPending,
    isStepWaitingForWallet,
    isStepConfirming,
    removeLiquidityConfirmed,
    txError,
    txProgress.hasError,
  ])

  const handleRemoveLiquidity = useCallback(async () => {
    setTxError(null)
    setRemoveLiquidityConfirmed(false)

    if (!address || chainId !== ARC_CHAIN_ID || paused) return
    if (!lpAmountValidation.valid || !hasExpectedOut) return
    if (userLpBalance !== undefined && lpAmountRaw > userLpBalance) return

    ensureFlow()
    txProgress.resetStep('remove_liquidity')
    txProgress.markWaiting('remove_liquidity')

    try {
      if (!publicClient) {
        throw new Error('Arc Testnet client is unavailable. Check wallet network and RPC configuration.')
      }

      await publicClient.simulateContract({
        account: address,
        address: COCO_STABLE_POOL.poolAddress,
        abi: COCO_STABLE_POOL_REMOVE_LIQUIDITY_ABI,
        functionName: 'removeLiquidity',
        args: [lpAmountRaw, minAmount0Raw, minAmount1Raw, address],
      })
    } catch (error) {
      const message = getSimulationErrorSummary(error)
      setTxError(message)
      setTxErrorDetails(isRateLimitError(error) || isUserRejected(error) ? null : getErrorDetails(error))
      txProgress.markFailed('remove_liquidity', message.slice(0, 80))
      return
    }

    writeContract(
      {
        address: COCO_STABLE_POOL.poolAddress,
        abi: COCO_STABLE_POOL_REMOVE_LIQUIDITY_ABI,
        functionName: 'removeLiquidity',
        args: [lpAmountRaw, minAmount0Raw, minAmount1Raw, address],
        chainId: ARC_CHAIN_ID,
      },
      {
        onSuccess: (hash) => {
          setLastSuccessHash(hash)
          txProgress.markSubmitted('remove_liquidity', hash)
          void monitorTransaction(hash)
        },
        onError: (error) => {
          const message = getFriendlyErrorMessage(error)
          if (isUserRejected(error)) {
            setTxError(message)
            setTxErrorDetails(null)
            txProgress.markRejected('remove_liquidity')
          } else {
            setTxError(message)
            setTxErrorDetails(null)
            txProgress.markFailed('remove_liquidity', message)
          }
        },
      }
    )
  }, [
    address,
    chainId,
    paused,
    lpAmountValidation.valid,
    hasExpectedOut,
    userLpBalance,
    lpAmountRaw,
    ensureFlow,
    txProgress,
    publicClient,
    minAmount0Raw,
    minAmount1Raw,
    writeContract,
    monitorTransaction,
  ])

  const handleAction = () => {
    if (actionState.action === 'remove' || actionState.action === 'failed' || actionState.action === 'rejected') {
      void handleRemoveLiquidity()
    }
  }

  const handleCheckStatus = useCallback(async () => {
    if (!txProgress.currentFlow || isCheckingStatus) return

    try {
      setIsCheckingStatus(true)
      setTxError(null)

      const step = txProgress.activeStep
      if (!step?.txHash || step.status === 'success' || step.status === 'failed' || step.status === 'rejected' || step.status === 'idle') return

      const status = await getReceiptStatus(step.txHash)

      if (status === 'rate_limited') {
        setTxError(MANUAL_RATE_LIMIT_COPY)
        return
      }

      if (status === 'success') {
        markRemoveSuccessFromChain(step.txHash)
        return
      }

      if (status === 'reverted') {
        setTxError('Transaction reverted')
        txProgress.markFailed('remove_liquidity', 'Transaction reverted')
      }
    } finally {
      setIsCheckingStatus(false)
    }
  }, [getReceiptStatus, isCheckingStatus, markRemoveSuccessFromChain, txProgress])

  const lpBalanceLabel = userLpBalance !== undefined
    ? `${formatTokenAmount(userLpBalance, lpDecimals)} cSLP`
    : isConnected ? '...' : 'Connect wallet'
  const expectedOutputLabel = expectedOut.available
    ? `${formatTokenAmount(expectedOut.amount0, token0.decimals)} ${token0.symbol} / ${formatTokenAmount(expectedOut.amount1, token1.decimals)} ${token1.symbol}`
    : 'Estimated output unavailable. Set min outputs carefully.'
  const minimumOutputLabel = hasExpectedOut
    ? `${formatTokenAmount(minAmount0Raw, token0.decimals)} ${token0.symbol} / ${formatTokenAmount(minAmount1Raw, token1.decimals)} ${token1.symbol}`
    : 'Unavailable'

  return (
    <div className="mt-4 rounded-xl border border-blue-400/20 bg-coco-dark-bg/55 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-blue-300">Arc Testnet only</p>
          <h4 className="mt-1 flex items-center gap-2 text-base font-semibold text-coco-dark-text">
            <MinusCircle className="h-4 w-4 text-blue-300" />
            Remove Liquidity
          </h4>
          <p className="mt-1 text-xs leading-relaxed text-coco-dark-muted">
            Burns cSLP directly from your wallet through CocoStablePool V1. No LP approval is required by this pool contract.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <RemoveLiquidityBadge>Arc Testnet</RemoveLiquidityBadge>
          <RemoveLiquidityBadge>LP Beta</RemoveLiquidityBadge>
          <RemoveLiquidityBadge>Unaudited</RemoveLiquidityBadge>
          <RemoveLiquidityBadge>Not routed</RemoveLiquidityBadge>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <RemoveInput
          label="cSLP amount"
          value={lpAmountInput}
          onChange={handleLpAmountChange}
          balance={lpBalanceLabel}
          error={lpAmountInput ? lpAmountValidation.error : null}
        />
        <div className="rounded-xl border border-coco-dark-border bg-coco-dark-surface/70 p-3">
          <p className="text-xs text-coco-dark-muted">Estimated USDC out</p>
          <p className="mt-2 truncate font-mono text-lg text-coco-dark-text">
            {hasExpectedOut ? formatTokenAmount(expectedOut.amount0, token0.decimals) : '-'}
          </p>
          <p className="mt-1 text-[11px] text-coco-dark-muted">Before slippage</p>
        </div>
        <div className="rounded-xl border border-coco-dark-border bg-coco-dark-surface/70 p-3">
          <p className="text-xs text-coco-dark-muted">Estimated EURC out</p>
          <p className="mt-2 truncate font-mono text-lg text-coco-dark-text">
            {hasExpectedOut ? formatTokenAmount(expectedOut.amount1, token1.decimals) : '-'}
          </p>
          <p className="mt-1 text-[11px] text-coco-dark-muted">Before slippage</p>
        </div>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-coco-dark-muted">
        Percent buttons auto-fill cSLP. Minimum outputs are derived from the estimated output and selected slippage.
      </p>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {[
          ['25%', BigInt(1), BigInt(4)],
          ['50%', BigInt(1), BigInt(2)],
          ['75%', BigInt(3), BigInt(4)],
          ['Max', BigInt(1), BigInt(1)],
        ].map(([label, numerator, denominator]) => (
          <button
            key={String(label)}
            type="button"
            onClick={() => setPercentAmount(numerator as bigint, denominator as bigint)}
            disabled={!userLpBalance || userLpBalance <= BigInt(0)}
            className="rounded-lg border border-blue-400/20 bg-blue-400/10 px-2 py-2 text-xs font-semibold text-blue-300 transition-colors hover:bg-blue-400/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3">
        <SlippageSelector valueBps={slippageBps} onChange={setSlippageBps} />
      </div>

      <details className="group mt-4 rounded-xl border border-coco-dark-border bg-coco-dark-surface/55 p-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold text-coco-dark-text">
          <span>Advanced details</span>
          <span className="text-[11px] font-normal text-coco-dark-muted group-open:hidden">Show</span>
          <span className="hidden text-[11px] font-normal text-coco-dark-muted group-open:inline">Hide</span>
        </summary>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <RemoveMetric label="Current USDC reserve" value={`${formatTokenAmount(reserve0, token0.decimals)} ${token0.symbol}`} />
          <RemoveMetric label="Current EURC reserve" value={`${formatTokenAmount(reserve1, token1.decimals)} ${token1.symbol}`} />
          <RemoveMetric label="LP holder" value={address ? truncateAddress(address) : 'Connect wallet'} mono />
          <RemoveMetric label="Expected output" value={expectedOutputLabel} mono />
          <RemoveMetric label="Minimum output" value={minimumOutputLabel} mono />
        </div>
      </details>

      <div className="mt-3 rounded-lg border border-coco-amber-500/20 bg-coco-amber-500/10 p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-coco-amber-500" />
          <p className="text-xs leading-relaxed text-coco-amber-500">
            Arc Testnet LP Beta. Use tiny test amounts only. Unaudited. Not routed. Beta observability only.
          </p>
        </div>
      </div>

      {txError && (
        <div className="mt-3 rounded-lg border border-coco-red-500/20 bg-coco-red-500/10 px-3 py-2 text-xs leading-relaxed text-coco-red-500">
          <p>{txError}</p>
          {txErrorDetails && (
            <details className="mt-2 text-[11px] text-coco-red-500/80">
              <summary className="cursor-pointer font-semibold">Debug details</summary>
              <p className="mt-1 max-h-28 overflow-auto break-words font-mono">{txErrorDetails}</p>
            </details>
          )}
        </div>
      )}

      {showRecovery && (
        <div className="mt-3 rounded-lg border border-coco-amber-500/20 bg-coco-amber-500/10 p-3">
          {activeStepTimedOut && (
            <p className="text-xs leading-relaxed text-coco-amber-500">
              Transaction may already be confirmed. Click Check status.
            </p>
          )}
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <a
              href={`https://testnet.arcscan.app/tx/${activeTxHash}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs text-coco-teal-400 hover:text-coco-teal-300"
            >
              View transaction on Arcscan
            </a>
            <button
              type="button"
              onClick={handleCheckStatus}
              disabled={isCheckingStatus}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-coco-teal-400/25 bg-coco-teal-400/10 px-3 py-2 text-xs font-semibold text-coco-teal-300 transition-colors hover:bg-coco-teal-400/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isCheckingStatus ? 'animate-spin' : ''}`} />
              {isCheckingStatus ? 'Checking...' : 'Check status'}
            </button>
          </div>
        </div>
      )}

      {lastSuccessHash && removeLiquidityConfirmed && (
        <a
          href={`https://testnet.arcscan.app/tx/${lastSuccessHash}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex rounded-lg border border-coco-green-500/25 bg-coco-green-500/10 px-3 py-2 text-xs font-medium text-coco-green-500 transition-colors hover:bg-coco-green-500/15"
        >
          View remove liquidity transaction
        </a>
      )}

      <button
        type="button"
        disabled={actionState.disabled}
        onClick={handleAction}
        className={`mt-4 w-full rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
          actionState.disabled
            ? 'cursor-not-allowed bg-coco-dark-border text-coco-dark-muted'
            : 'bg-blue-500 text-white shadow-lg shadow-blue-500/20 hover:-translate-y-0.5 hover:bg-blue-600'
        }`}
      >
        {actionState.label}
      </button>

      <TransactionProgressPanel
        currentFlow={txProgress.currentFlow}
        history={txProgress.history}
        onClear={txProgress.clearFlow}
        onCheckStatus={handleCheckStatus}
      />
    </div>
  )
}
