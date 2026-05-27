import { useState, useMemo, useEffect, useCallback } from 'react'
import { Card } from '@/components/common/Card'
import { TokenIcon } from '@/components/common/TokenIcon'
import { TransactionProgressPanel } from '@/components/transactions/TransactionProgressPanel'
import { Settings, ArrowDownUp, ChevronDown, Info, AlertTriangle, Wifi, Shield } from 'lucide-react'
import { USDC, EURC } from '@/config/tokens'
import { ROUTER_ADDRESS } from '@/config/contracts'
import { useAccount } from 'wagmi'
import { usePairReserves } from '@/hooks/usePairReserves'
import { useTokenBalance } from '@/hooks/useTokenBalance'
import { useApprove } from '@/hooks/useApprove'
import { useSwap } from '@/hooks/useSwap'
import { useNetworkGuard } from '@/hooks/useNetworkGuard'
import { useTransactionSettings } from '@/hooks/useSettings'
import type { ApprovalMode } from '@/hooks/useSettings'
import { useTransactionProgress } from '@/hooks/useTransactionProgress'
import { useCheckReceipt } from '@/hooks/useCheckReceipt'
import { formatTokenAmount, parseTokenAmount } from '@/utils/format'
import { getAmountOut, calculatePriceImpact, calculateMinimumReceived } from '@/utils/price'
import type { Token } from '@/types/token'
import type { TransactionType } from '@/types/transactions'

export function SwapPage() {
  const { address, isConnected } = useAccount()

  // ─── Fix 2: Real fromToken/toToken state with flip ───
  const [fromToken, setFromToken] = useState<Token>(USDC)
  const [toToken, setToToken] = useState<Token>(EURC)
  const [fromAmount, setFromAmount] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const { slippage, slippageBps, setSlippage, getDeadlineTimestamp, deadline, setDeadline, approvalMode, setApprovalMode } = useTransactionSettings()

  // Network guard — require Arc Testnet for all DEX operations
  const { isWrongNetwork, switchToArc, isSwitching } = useNetworkGuard()

  // Live reserves
  const { reserveUsdc, reserveEurc, hasLiquidity, isLoading: reservesLoading, refetch: refetchReserves } = usePairReserves()

  // Live balances (ERC-20, 6 decimals — NOT native 18-decimal gas)
  const { balance: fromBalance, refetch: refetchFromBalance } = useTokenBalance(fromToken, address)
  const { balance: toBalance, refetch: refetchToBalance } = useTokenBalance(toToken, address)

  // Parse input to bigint
  const fromAmountRaw = useMemo(() => {
    if (!fromAmount || parseFloat(fromAmount) <= 0) return BigInt(0)
    return parseTokenAmount(fromAmount, fromToken.decimals)
  }, [fromAmount, fromToken.decimals])

  // Compute output from live reserves — direction-aware
  const { toAmountRaw, toAmountDisplay, priceImpact, minReceivedRaw, minReceivedDisplay, rate } = useMemo(() => {
    if (!hasLiquidity || fromAmountRaw <= BigInt(0) || !reserveUsdc || !reserveEurc) {
      return { toAmountRaw: BigInt(0), toAmountDisplay: '', priceImpact: 0, minReceivedRaw: BigInt(0), minReceivedDisplay: '', rate: undefined }
    }

    // Direction-aware reserves: which is the input reserve, which is output
    const isFromUsdc = fromToken.address.toLowerCase() === USDC.address.toLowerCase()
    const rIn = isFromUsdc ? reserveUsdc : reserveEurc
    const rOut = isFromUsdc ? reserveEurc : reserveUsdc

    const out = getAmountOut(fromAmountRaw, rIn, rOut)
    const impact = calculatePriceImpact(fromAmountRaw, out, rIn, rOut)
    const minRec = calculateMinimumReceived(out, slippageBps)

    // Rate: how much toToken per 1 fromToken
    const computedRate = rIn > BigInt(0) ? Number(rOut) / Number(rIn) : undefined

    return {
      toAmountRaw: out,
      toAmountDisplay: formatTokenAmount(out, toToken.decimals),
      priceImpact: impact,
      minReceivedRaw: minRec,
      minReceivedDisplay: formatTokenAmount(minRec, toToken.decimals),
      rate: computedRate,
    }
  }, [hasLiquidity, fromAmountRaw, reserveUsdc, reserveEurc, fromToken, toToken, slippageBps])

  // ─── Approval: targets the fromToken (the token being spent) ───
  const {
    needsApproval, approve, isApproving, isWaitingForReceipt: isApprovalConfirming,
    isApproved: approvalConfirmed, isReverted: approvalReverted,
    approvalTxHash, error: approveError, refetchAllowance, resetApproval,
  } = useApprove(fromToken, ROUTER_ADDRESS, fromAmountRaw, approvalMode)

  // Swap execution
  const { swap, isPending: isSwapping, isConfirming: isSwapConfirming, txHash: swapTxHash, isSuccess: swapSuccess, isReverted: swapReverted, error: swapError, reset: resetSwap } = useSwap()

  // Transaction progress tracking (strict sequential)
  const txProgress = useTransactionProgress()
  const { checkReceipt } = useCheckReceipt()

  // Derive approve type from current fromToken
  const approveType: TransactionType = fromToken.symbol === 'USDC' ? 'approve_usdc' : 'approve_eurc'

  // ─── Fix 1: Track approval submitted state via hash ───
  // When approvalTxHash arrives, mark the approval step as submitted/pending_onchain
  useEffect(() => {
    if (!txProgress.currentFlow || !approvalTxHash) return
    const step = txProgress.currentFlow.steps.find((s) => s.type === approveType)
    if (!step) return
    // Only transition from waiting → pending_onchain
    if (step.status === 'waiting_wallet_confirmation') {
      txProgress.markSubmitted(approveType, approvalTxHash)
    }
  }, [approvalTxHash, approveType, txProgress])

  // When approval receipt confirms success, mark step success
  useEffect(() => {
    if (!txProgress.currentFlow || !approvalConfirmed) return
    const step = txProgress.currentFlow.steps.find((s) => s.type === approveType)
    if (!step || step.status === 'success' || step.status === 'idle') return
    txProgress.markSuccess(approveType)
    // Refetch allowance so the button state updates
    refetchAllowance()
  }, [approvalConfirmed, approveType, txProgress, refetchAllowance])

  // When approval receipt indicates revert, mark step failed
  useEffect(() => {
    if (!txProgress.currentFlow || !approvalReverted) return
    const step = txProgress.currentFlow.steps.find((s) => s.type === approveType)
    if (!step || step.status === 'success' || step.status === 'idle') return
    txProgress.markFailed(approveType, 'Transaction reverted')
  }, [approvalReverted, approveType, txProgress])

  // When approval errors (user rejected etc), mark appropriately
  useEffect(() => {
    if (!txProgress.currentFlow || !approveError) return
    const step = txProgress.currentFlow.steps.find((s) => s.type === approveType)
    if (!step || step.status === 'success' || step.status === 'idle') return
    const msg = approveError.message || 'Approval failed'
    if (msg.includes('rejected') || msg.includes('denied')) {
      txProgress.markRejected(approveType)
    } else {
      txProgress.markFailed(approveType, msg.slice(0, 80))
    }
  }, [approveError, approveType, txProgress])

  // ─── Fix 1: Track swap submitted state via hash ───
  useEffect(() => {
    if (!txProgress.currentFlow || !swapTxHash) return
    const step = txProgress.currentFlow.steps.find((s) => s.type === 'swap')
    if (!step) return
    if (step.status === 'waiting_wallet_confirmation') {
      txProgress.markSubmitted('swap', swapTxHash)
    }
  }, [swapTxHash, txProgress])

  // When swap receipt confirms success
  useEffect(() => {
    if (!txProgress.currentFlow || !swapSuccess) return
    const step = txProgress.currentFlow.steps.find((s) => s.type === 'swap')
    if (!step || step.status === 'success' || step.status === 'idle') return
    txProgress.markSuccess('swap')
    // Refetch balances and reserves after successful swap
    refetchFromBalance()
    refetchToBalance()
    refetchReserves()
  }, [swapSuccess, txProgress, refetchFromBalance, refetchToBalance, refetchReserves])

  // When swap receipt indicates revert
  useEffect(() => {
    if (!txProgress.currentFlow || !swapReverted) return
    const step = txProgress.currentFlow.steps.find((s) => s.type === 'swap')
    if (!step || step.status === 'success' || step.status === 'idle') return
    txProgress.markFailed('swap', 'Transaction reverted')
  }, [swapReverted, txProgress])

  // When swap errors
  useEffect(() => {
    if (!txProgress.currentFlow || !swapError) return
    const step = txProgress.currentFlow.steps.find((s) => s.type === 'swap')
    if (!step || step.status === 'success' || step.status === 'idle') return
    const msg = swapError.message || 'Swap failed'
    if (msg.includes('rejected') || msg.includes('denied')) {
      txProgress.markRejected('swap')
    } else {
      txProgress.markFailed('swap', msg.slice(0, 80))
    }
  }, [swapError, txProgress])

  // ─── Fix 1: Check Status handler — manually poll receipts for all known tx hashes ───
  const handleCheckStatus = useCallback(async () => {
    if (!txProgress.currentFlow) return

    for (const step of txProgress.currentFlow.steps) {
      if (!step.txHash) continue
      // Only check steps that are still pending
      if (step.status === 'success' || step.status === 'failed' || step.status === 'rejected' || step.status === 'idle') continue

      const status = await checkReceipt(step.txHash)
      if (status === 'success') {
        txProgress.markSuccess(step.type)
      } else if (status === 'reverted') {
        txProgress.markFailed(step.type, 'Transaction reverted')
      }
      // 'pending' and 'error' — leave as-is, user can check again later
    }

    // Refetch on-chain state regardless
    refetchAllowance()
    refetchFromBalance()
    refetchToBalance()
    refetchReserves()
  }, [txProgress, checkReceipt, refetchAllowance, refetchFromBalance, refetchToBalance, refetchReserves])

  // ─── Fix 2: Flip handler — swap fromToken and toToken ───
  const handleFlip = useCallback(() => {
    setFromToken(toToken)
    setToToken(fromToken)
    // Move the computed output to the input field (swap amounts)
    setFromAmount(toAmountDisplay || '')
    // Clear any stale transaction progress from previous direction
    txProgress.clearFlow()
    // Reset approval/swap state for the new direction
    resetApproval()
    resetSwap()
  }, [fromToken, toToken, toAmountDisplay, txProgress, resetApproval, resetSwap])

  // Button state machine
  const buttonState = useMemo(() => {
    if (!isConnected) return { text: 'Connect Wallet', disabled: true, action: 'connect' as const }
    if (isWrongNetwork) return { text: isSwitching ? 'Switching...' : 'Switch to Arc Testnet', disabled: isSwitching, action: 'switch-network' as const }
    if (reservesLoading) return { text: 'Loading...', disabled: true, action: 'loading' as const }
    if (!hasLiquidity) return { text: 'Pool has no liquidity', disabled: true, action: 'no-liquidity' as const }
    if (!fromAmount || parseFloat(fromAmount) <= 0) return { text: 'Enter an amount', disabled: true, action: 'enter' as const }
    if (fromBalance !== undefined && fromAmountRaw > fromBalance) return { text: 'Insufficient balance', disabled: true, action: 'insufficient' as const }
    if (isApproving || isApprovalConfirming) return { text: `Approving ${fromToken.symbol}...`, disabled: true, action: 'approving' as const }
    if (needsApproval) return { text: `Approve ${fromToken.symbol}`, disabled: false, action: 'approve' as const }
    if (isSwapping || isSwapConfirming) return { text: 'Swapping...', disabled: true, action: 'swapping' as const }
    return { text: 'Swap', disabled: false, action: 'swap' as const }
  }, [isConnected, isWrongNetwork, isSwitching, reservesLoading, hasLiquidity, fromAmount, fromBalance, fromAmountRaw, isApproving, isApprovalConfirming, needsApproval, fromToken.symbol, isSwapping, isSwapConfirming])

  const handleButtonClick = () => {
    if (buttonState.action === 'switch-network') {
      switchToArc()
      return
    }

    // ─── Hard guard: never start DEX actions on wrong network ───
    if (isWrongNetwork) return

    if (buttonState.action === 'approve') {
      // Start flow with approve + swap steps
      txProgress.startFlow([
        { type: approveType, label: `Approve ${fromToken.symbol}` },
        { type: 'swap', label: 'Swap' },
      ])
      txProgress.markWaiting(approveType)
      // Pass onHash callback to capture tx hash immediately
      approve((hash) => {
        txProgress.markSubmitted(approveType, hash)
      })
    } else if (buttonState.action === 'swap' && address) {
      // Start or continue flow with just swap step
      if (!txProgress.currentFlow) {
        txProgress.startFlow([{ type: 'swap', label: 'Swap' }])
      }
      txProgress.markWaiting('swap')
      swap(
        {
          tokenIn: fromToken,
          tokenOut: toToken,
          amountIn: fromAmountRaw,
          amountOutMin: minReceivedRaw,
          to: address,
          deadline: getDeadlineTimestamp(),
        },
        (hash) => {
          txProgress.markSubmitted('swap', hash)
        }
      )
    }
  }

  const formattedFromBalance = fromBalance !== undefined ? formatTokenAmount(fromBalance, fromToken.decimals) : '—'
  const formattedToBalance = toBalance !== undefined ? formatTokenAmount(toBalance, toToken.decimals) : '—'

  return (
    <div className="pt-24 pb-12 px-4 flex flex-col items-center">
      <div className="fixed inset-0 bg-gradient-to-b from-coco-green-500/3 via-transparent to-transparent pointer-events-none" />

      <Card className="relative w-full max-w-[480px] p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-coco-dark-text">Swap</h2>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg hover:bg-coco-dark-bg text-coco-dark-muted hover:text-coco-dark-text transition-colors"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>

        {/* Settings */}
        {showSettings && (
          <SwapSettings slippage={slippage} setSlippage={setSlippage} deadline={deadline} setDeadline={setDeadline} approvalMode={approvalMode} setApprovalMode={setApprovalMode} />
        )}

        {/* Wrong network banner */}
        {isWrongNetwork && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-coco-red-500/10 border border-coco-red-500/20 p-3.5">
            <Wifi className="h-4 w-4 text-coco-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-coco-red-500">Wrong network. Switch to Arc Testnet to use Coco DEX.</p>
          </div>
        )}

        {/* No liquidity banner */}
        {!isWrongNetwork && !reservesLoading && !hasLiquidity && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-coco-amber-500/10 border border-coco-amber-500/20 p-3.5">
            <AlertTriangle className="h-4 w-4 text-coco-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-coco-amber-500">This pool has no liquidity yet. Add liquidity before swapping.</p>
          </div>
        )}

        {/* From */}
        <TokenInput
          label="From"
          token={fromToken}
          amount={fromAmount}
          onAmountChange={setFromAmount}
          balance={formattedFromBalance}
          onMax={() => fromBalance && setFromAmount(formatTokenAmount(fromBalance, fromToken.decimals))}
        />

        {/* Direction toggle — Fix 2: wired up with onClick */}
        <div className="flex justify-center -my-2 relative z-10">
          <button
            onClick={handleFlip}
            className="p-2 rounded-xl bg-coco-dark-surface border border-coco-dark-border hover:border-coco-green-500/50 text-coco-dark-muted hover:text-coco-green-500 transition-all hover:rotate-180 duration-300"
            title="Switch tokens"
          >
            <ArrowDownUp className="h-4 w-4" />
          </button>
        </div>

        {/* To */}
        <TokenInput
          label="To"
          token={toToken}
          amount={toAmountDisplay}
          onAmountChange={() => {}}
          balance={formattedToBalance}
          readOnly
        />

        {/* Price Info */}
        {hasLiquidity && fromAmount && parseFloat(fromAmount) > 0 && toAmountRaw > BigInt(0) && (
          <div className="mt-4 rounded-xl bg-coco-dark-bg border border-coco-dark-border p-3.5 space-y-2">
            <PriceRow label="Rate" value={`1 ${fromToken.symbol} = ${rate?.toFixed(6) ?? '—'} ${toToken.symbol}`} />
            <PriceRow
              label="Price Impact"
              value={`${priceImpact.toFixed(3)}%`}
              valueColor={priceImpact < 1 ? 'text-coco-green-500' : priceImpact < 3 ? 'text-coco-amber-500' : 'text-coco-red-500'}
            />
            <PriceRow label="Min. Received" value={`${minReceivedDisplay} ${toToken.symbol}`} />
            <PriceRow label="Route" value={`${fromToken.symbol} → ${toToken.symbol}`} />
            <PriceRow label="Slippage Tolerance" value={`${slippage}%`} />
          </div>
        )}

        {/* Swap Button */}
        <button
          disabled={buttonState.disabled}
          onClick={handleButtonClick}
          className={`mt-6 w-full py-3.5 rounded-xl font-medium text-base transition-all ${
            buttonState.disabled
              ? 'bg-coco-dark-border text-coco-dark-muted cursor-not-allowed'
              : 'bg-coco-green-500 text-white hover:bg-coco-green-600 active:scale-[0.99] shadow-lg shadow-coco-green-500/20'
          }`}
        >
          {buttonState.text}
        </button>
      </Card>

      {/* Transaction Progress Panel */}
      <TransactionProgressPanel
        currentFlow={txProgress.currentFlow}
        history={txProgress.history}
        onClear={txProgress.clearFlow}
        onCheckStatus={handleCheckStatus}
      />
    </div>
  )
}

function TokenInput({
  label, token, amount, onAmountChange, balance, readOnly = false, onMax,
}: {
  label: string; token: Token; amount: string; onAmountChange: (v: string) => void; balance: string; readOnly?: boolean; onMax?: () => void
}) {
  return (
    <div className="rounded-xl bg-coco-dark-bg border border-coco-dark-border p-4 mt-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-coco-dark-muted">{label}</span>
        <button onClick={onMax} className="text-xs text-coco-dark-muted hover:text-coco-green-500 transition-colors">
          Balance: <span className="font-mono">{balance}</span>
        </button>
      </div>
      <div className="flex items-center gap-3">
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-coco-dark-surface border border-coco-dark-border hover:border-coco-green-500/50 transition-colors shrink-0">
          <TokenIcon symbol={token.symbol} color={token.logoColor} size="sm" />
          <span className="text-sm font-medium text-coco-dark-text">{token.symbol}</span>
          <ChevronDown className="h-3.5 w-3.5 text-coco-dark-muted" />
        </button>
        <input
          type="number"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          placeholder="0.00"
          readOnly={readOnly}
          className="w-full bg-transparent text-right text-2xl font-mono text-coco-dark-text placeholder:text-coco-dark-border outline-none"
        />
      </div>
    </div>
  )
}

function SwapSettings({ slippage, setSlippage, deadline, setDeadline, approvalMode, setApprovalMode }: { slippage: number; setSlippage: (v: number) => string | null; deadline: number; setDeadline: (v: number) => string | null; approvalMode: ApprovalMode; setApprovalMode: (v: ApprovalMode) => void }) {
  const presets = [0.1, 0.5, 1.0]
  return (
    <div className="mb-4 rounded-xl bg-coco-dark-bg border border-coco-dark-border p-4 space-y-4">
      <div>
        <div className="flex items-center gap-1.5 mb-3">
          <Info className="h-3.5 w-3.5 text-coco-dark-muted" />
          <span className="text-xs text-coco-dark-muted">Slippage Tolerance</span>
        </div>
        <div className="flex gap-2">
          {presets.map((val) => (
            <button
              key={val}
              onClick={() => setSlippage(val)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                slippage === val
                  ? 'bg-coco-green-500/10 text-coco-green-500 border border-coco-green-500/30'
                  : 'bg-coco-dark-surface border border-coco-dark-border text-coco-dark-muted hover:text-coco-dark-text'
              }`}
            >
              {val}%
            </button>
          ))}
          <div className="flex-1 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-coco-dark-surface border border-coco-dark-border">
            <input
              type="number"
              placeholder="Custom"
              defaultValue={!presets.includes(slippage) ? slippage : undefined}
              onBlur={(e) => e.target.value && setSlippage(parseFloat(e.target.value))}
              className="w-full bg-transparent text-sm text-coco-dark-text placeholder:text-coco-dark-muted outline-none font-mono"
            />
            <span className="text-xs text-coco-dark-muted">%</span>
          </div>
        </div>
      </div>
      <div>
        <span className="text-xs text-coco-dark-muted">Transaction Deadline</span>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            value={deadline}
            onChange={(e) => setDeadline(parseInt(e.target.value) || 20)}
            className="w-16 px-2 py-1.5 rounded-lg bg-coco-dark-surface border border-coco-dark-border text-sm font-mono text-coco-dark-text outline-none"
          />
          <span className="text-xs text-coco-dark-muted">minutes</span>
        </div>
      </div>
      {/* Approval Mode */}
      <div>
        <div className="flex items-center gap-1.5 mb-3">
          <Shield className="h-3.5 w-3.5 text-coco-dark-muted" />
          <span className="text-xs text-coco-dark-muted">Approval Mode</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setApprovalMode('max')}
            className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              approvalMode === 'max'
                ? 'bg-coco-green-500/10 text-coco-green-500 border border-coco-green-500/30'
                : 'bg-coco-dark-surface border border-coco-dark-border text-coco-dark-muted hover:text-coco-dark-text'
            }`}
          >
            Max approval
          </button>
          <button
            onClick={() => setApprovalMode('exact')}
            className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              approvalMode === 'exact'
                ? 'bg-coco-green-500/10 text-coco-green-500 border border-coco-green-500/30'
                : 'bg-coco-dark-surface border border-coco-dark-border text-coco-dark-muted hover:text-coco-dark-text'
            }`}
          >
            Exact amount
          </button>
        </div>
        <p className="text-[11px] text-coco-dark-muted mt-2">
          {approvalMode === 'max'
            ? 'Max approval lets you swap without approving every time. You can revoke token allowances anytime from your wallet or explorer.'
            : 'Exact approval is safer but requires re-approval on each swap.'}
        </p>
      </div>
    </div>
  )
}

function PriceRow({ label, value, valueColor = 'text-coco-dark-text' }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-coco-dark-muted">{label}</span>
      <span className={`text-xs font-mono ${valueColor}`}>{value}</span>
    </div>
  )
}
