import { useState, useMemo, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card } from '@/components/common/Card'
import { TokenIcon } from '@/components/common/TokenIcon'
import { TransactionProgressPanel } from '@/components/transactions/TransactionProgressPanel'
import { Settings, ArrowDownUp, ChevronDown, Info, AlertTriangle, Wifi, Shield, Zap } from 'lucide-react'
import { USDC, EURC } from '@/config/tokens'
import { ROUTER_ADDRESS } from '@/config/contracts'
import { XYLONET_ROUTER_ADDRESS } from '@/config/externalDexes'
import { SYNTHRA_V3_SWAP_ROUTER_ADDRESS } from '@/config/synthra'
import { useAccount } from 'wagmi'
import { usePairReserves } from '@/hooks/usePairReserves'
import { useTokenBalance } from '@/hooks/useTokenBalance'
import { useApprove } from '@/hooks/useApprove'
import { useSwap } from '@/hooks/useSwap'
import { useXyloNetSwap } from '@/hooks/useXyloNetSwap'
import { useUnitFlowSwap } from '@/hooks/useUnitFlowSwap'
import { useSynthraSwap } from '@/hooks/useSynthraSwap'
import { useNetworkGuard } from '@/hooks/useNetworkGuard'
import { useTransactionSettings } from '@/hooks/useSettings'
import type { ApprovalMode } from '@/hooks/useSettings'
import { useTransactionProgress } from '@/hooks/useTransactionProgress'
import { useCheckReceipt } from '@/hooks/useCheckReceipt'
import { useAggregatedQuotes } from '@/hooks/useAggregatedQuotes'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { formatTokenAmount, parseTokenAmount } from '@/utils/format'
import { getAmountOut, calculatePriceImpact, calculateMinimumReceived } from '@/utils/price'
import type { Token } from '@/types/token'
import type { TransactionType } from '@/types/transactions'
import type { RouteQuote } from '@/lib/router/types'
import { isQuoteStale } from '@/lib/router/selectBestRoute'
import { safeBridgeAmount } from '@/features/bridge/postBridge'

export function SwapPage() {
  const { address, isConnected } = useAccount()
  const [searchParams] = useSearchParams()

  // ─── Fix 2: Real fromToken/toToken state with flip ───
  const [fromToken, setFromToken] = useState<Token>(USDC)
  const [toToken, setToToken] = useState<Token>(EURC)
  const initialBridgeAmount = searchParams.get('from') === 'USDC' && searchParams.get('to') === 'EURC' ? safeBridgeAmount(searchParams.get('amount')) : null
  const [fromAmount, setFromAmount] = useState(initialBridgeAmount ?? '')
  const [showSettings, setShowSettings] = useState(false)
  const [showQuotesMobile, setShowQuotesMobile] = useState(false)
  const [showAllRoutes, setShowAllRoutes] = useState(false)
  // Manual route override. null = follow the auto-selected best route.
  // Reset to null whenever amount/token pair changes or the chosen route
  // becomes unavailable, so the UI returns to "best route" by default.
  const [manualRouteId, setManualRouteId] = useState<string | null>(null)
  const [routeChangedWarning, setRouteChangedWarning] = useState(false)


  const { slippage, slippageBps, setSlippage, getDeadlineTimestamp, deadline, setDeadline, approvalMode, setApprovalMode } = useTransactionSettings()
  const hasValidFromAmount = fromAmount.trim() !== '' && Number.isFinite(Number(fromAmount)) && Number(fromAmount) > 0

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

  // Debounced amount drives quote fetching: refresh ~350ms after typing stops
  // rather than on every keystroke. While the two differ, quotes are "settling".
  const debouncedFromAmount = useDebouncedValue(fromAmount, 350)
  const debouncedFromAmountRaw = useMemo(() => {
    if (!debouncedFromAmount || parseFloat(debouncedFromAmount) <= 0) return BigInt(0)
    return parseTokenAmount(debouncedFromAmount, fromToken.decimals)
  }, [debouncedFromAmount, fromToken.decimals])
  const isDebouncing = hasValidFromAmount && debouncedFromAmount !== fromAmount

  // Compute Coco output from live reserves — direction-aware (used as fallback for Coco route)
  const { cocoAmountRaw, cocoPriceImpact, cocoMinReceivedRaw, cocoRate } = useMemo(() => {
    if (!hasLiquidity || fromAmountRaw <= BigInt(0) || !reserveUsdc || !reserveEurc) {
      return { cocoAmountRaw: BigInt(0), cocoPriceImpact: 0, cocoMinReceivedRaw: BigInt(0), cocoRate: undefined }
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
      cocoAmountRaw: out,
      cocoPriceImpact: impact,
      cocoMinReceivedRaw: minRec,
      cocoRate: computedRate,
    }
  }, [hasLiquidity, fromAmountRaw, reserveUsdc, reserveEurc, fromToken, slippageBps])


  const { quotes, bestQuote, noExecutableRouteReason, isLoading: quotesLoading, comingSoonSources } = useAggregatedQuotes({
    tokenIn: fromToken,
    tokenOut: toToken,
    amountIn: debouncedFromAmountRaw,
    reserveUsdc,
    reserveEurc,
    slippageBps,
    selectedQuoteId: manualRouteId ?? undefined,
  })

  // "Finding best route…" while debouncing or quotes are in flight for a valid amount.
  const isFindingRoute = hasValidFromAmount && (isDebouncing || quotesLoading)

  // Auto-select model:
  // - manualRouteId === null → follow bestQuote (auto best route).
  // - manualRouteId set → honor it only while that route is still executable+available.
  //   Otherwise fall back to bestQuote (handles "manual route became unavailable").
  const activeQuote = useMemo(() => {
    if (manualRouteId) {
      const manual = quotes.find((candidate) => candidate.id === manualRouteId)
      if (
        manual &&
        manual.availabilityStatus === 'available' &&
        manual.executionStatus === 'executable' &&
        manual.amountOut > BigInt(0)
      ) {
        return manual
      }
    }
    return bestQuote
  }, [quotes, manualRouteId, bestQuote])

  const isManualSelection = Boolean(manualRouteId) && activeQuote?.id === manualRouteId && activeQuote?.id !== bestQuote?.id

  // Reset manual override when amount or token pair changes → return to best route.
  useEffect(() => {
    // Intentionally reset manual route override when the swap pair/amount changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setManualRouteId(null)
    setRouteChangedWarning(false)
  }, [debouncedFromAmountRaw, fromToken.address, toToken.address])

  // Ticking clock for quote-freshness display. Avoids calling Date.now() during
  // render (impure) while keeping the "Fresh quote" / "Quote stale" label live.
  const [clockMs, setClockMs] = useState(() => Date.now())
  useEffect(() => {
    const handle = window.setInterval(() => setClockMs(Date.now()), 5_000)
    return () => window.clearInterval(handle)
  }, [])

  // Selecting a route from the list (only executable routes are selectable).
  const handleSelectRoute = useCallback((quoteId: string) => {
    setManualRouteId(quoteId)
    setRouteChangedWarning(false)
  }, [])

  // ─── Route-aware display values ───
  // When a route is selected, all displayed swap details come from activeQuote.
  // This ensures XyloNet quote values are shown when XyloNet is selected,
  // and Coco quote values are shown when Coco is selected.
  const { toAmountRaw, toAmountDisplay, priceImpact, minReceivedRaw, minReceivedDisplay, rate, displayRouteSource } = useMemo(() => {
    // If we have an active quote with a valid output, use it as the source of truth
    if (activeQuote && activeQuote.amountOut > BigInt(0)) {
      const amountOut = activeQuote.amountOut
      const minOut = activeQuote.minAmountOut
      // Compute rate from the quote: amountOut / amountIn (both in 6-decimal token units)
      const computedRate = fromAmountRaw > BigInt(0)
        ? Number(amountOut) / Number(fromAmountRaw)
        : undefined
      // Price impact: only compute for Coco where we have reserves
      const impact = activeQuote.source === 'coco' ? cocoPriceImpact : 0

      return {
        toAmountRaw: amountOut,
        toAmountDisplay: activeQuote.amountOutFormatted,
        priceImpact: impact,
        minReceivedRaw: minOut,
        minReceivedDisplay: formatTokenAmount(minOut, toToken.decimals),
        rate: computedRate,
        displayRouteSource: activeQuote.source === 'xylonet'
          ? 'XyloNet'
          : activeQuote.source === 'unitflow'
            ? 'UnitFlow'
            : activeQuote.source === 'synthra'
              ? 'Synthra'
              : activeQuote.source === 'coco_stable'
                ? 'Coco Native Stable'
              : 'Coco',
      }
    }

    // Fallback: use Coco reserve-computed values
    return {
      toAmountRaw: cocoAmountRaw,
      toAmountDisplay: cocoAmountRaw > BigInt(0) ? formatTokenAmount(cocoAmountRaw, toToken.decimals) : '',
      priceImpact: cocoPriceImpact,
      minReceivedRaw: cocoMinReceivedRaw,
      minReceivedDisplay: cocoMinReceivedRaw > BigInt(0) ? formatTokenAmount(cocoMinReceivedRaw, toToken.decimals) : '',
      rate: cocoRate,
      displayRouteSource: 'Coco',
    }
  }, [activeQuote, fromAmountRaw, cocoAmountRaw, cocoPriceImpact, cocoMinReceivedRaw, cocoRate, toToken])

  // ─── Route-aware approval spender ───
  // Coco route → approve Coco router. XyloNet route → approve XyloNet router.
  // SAFETY: Never approve the wrong router for the selected route.
  const approvalSpender: `0x${string}` = useMemo(() => {
    if (activeQuote?.source === 'synthra') return SYNTHRA_V3_SWAP_ROUTER_ADDRESS
    if (activeQuote?.source === 'xylonet') return XYLONET_ROUTER_ADDRESS
    return ROUTER_ADDRESS
  }, [activeQuote])
  const isUnitFlowRoute = activeQuote?.source === 'unitflow'
  const isSynthraRoute = activeQuote?.source === 'synthra'
  const approvalAmount = isUnitFlowRoute ? BigInt(0) : fromAmountRaw

  // ─── Approval: targets the fromToken with the route-aware spender ───
  const {
    allowance, needsApproval, approve, isApproving, isWaitingForReceipt: isApprovalConfirming,
    isApproved: approvalConfirmed, isReverted: approvalReverted,
    approvalTxHash, error: approveError, refetchAllowance, resetApproval,
  } = useApprove(fromToken, approvalSpender, approvalAmount, approvalMode)

  // Coco swap execution
  const { swap: cocoSwap, isPending: isCocoSwapping, isConfirming: isCocoSwapConfirming, txHash: cocoSwapTxHash, isSuccess: cocoSwapSuccess, isReverted: cocoSwapReverted, error: cocoSwapError, reset: resetCocoSwap } = useSwap()

  // XyloNet swap execution
  const { swap: xyloNetSwap, isPending: isXyloNetSwapping, isConfirming: isXyloNetSwapConfirming, txHash: xyloNetSwapTxHash, isSuccess: xyloNetSwapSuccess, isReverted: xyloNetSwapReverted, error: xyloNetSwapError, simulationError: xyloNetSimulationError, clearSimulationError, reset: resetXyloNetSwap } = useXyloNetSwap()

  // UnitFlow UniversalRouter execution
  const { swap: unitFlowSwap, isPending: isUnitFlowSwapping, isConfirming: isUnitFlowSwapConfirming, txHash: unitFlowSwapTxHash, isSuccess: unitFlowSwapSuccess, isReverted: unitFlowSwapReverted, error: unitFlowSwapError, simulationError: unitFlowSimulationError, clearSimulationError: clearUnitFlowSimulationError, reset: resetUnitFlowSwap } = useUnitFlowSwap()
  const { swap: synthraSwap, isPending: isSynthraSwapping, isConfirming: isSynthraSwapConfirming, txHash: synthraSwapTxHash, isSuccess: synthraSwapSuccess, isReverted: isSynthraSwapReverted, error: synthraSwapError, simulationError: synthraSimulationError, clearSimulationError: clearSynthraSimulationError, reset: resetSynthraSwap } = useSynthraSwap()

  // Unified swap state (route-aware)
  const isXyloNetRoute = activeQuote?.source === 'xylonet'
  const isSwapping = isUnitFlowRoute
    ? isUnitFlowSwapping
    : isXyloNetRoute
      ? isXyloNetSwapping
      : isSynthraRoute
        ? isSynthraSwapping
        : isCocoSwapping
  const isSwapConfirming = isUnitFlowRoute
    ? isUnitFlowSwapConfirming
    : isXyloNetRoute
      ? isXyloNetSwapConfirming
      : isSynthraRoute
        ? isSynthraSwapConfirming
        : isCocoSwapConfirming
  const swapTxHash = isUnitFlowRoute
    ? unitFlowSwapTxHash
    : isXyloNetRoute
      ? xyloNetSwapTxHash
      : isSynthraRoute
        ? synthraSwapTxHash
        : cocoSwapTxHash
  const swapSuccess = isUnitFlowRoute
    ? unitFlowSwapSuccess
    : isXyloNetRoute
      ? xyloNetSwapSuccess
      : isSynthraRoute
        ? synthraSwapSuccess
        : cocoSwapSuccess
  const swapReverted = isUnitFlowRoute
    ? unitFlowSwapReverted
    : isXyloNetRoute
      ? xyloNetSwapReverted
      : isSynthraRoute
        ? isSynthraSwapReverted
        : cocoSwapReverted
  const swapError = isUnitFlowRoute
    ? unitFlowSwapError
    : isXyloNetRoute
      ? xyloNetSwapError
      : isSynthraRoute
        ? synthraSwapError
        : cocoSwapError

  useEffect(() => {
    clearSimulationError()
    clearUnitFlowSimulationError()
    clearSynthraSimulationError()
  }, [clearSimulationError, clearUnitFlowSimulationError, clearSynthraSimulationError, manualRouteId, fromAmountRaw, activeQuote?.minAmountOut, fromToken.address, toToken.address])

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
    // Clear any stale XyloNet simulation error — the approval was the missing prerequisite.
    // Now the user can proceed to swap and a fresh simulation will run.
    clearSimulationError()
    clearUnitFlowSimulationError()
  }, [approvalConfirmed, approveType, txProgress, refetchAllowance, clearSimulationError, clearUnitFlowSimulationError])

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
    const revertMsg = isXyloNetRoute
      ? 'XyloNet swap reverted. Check min received, approval, or pool state.'
      : 'Transaction reverted'
    txProgress.markFailed('swap', revertMsg)
  }, [swapReverted, txProgress, isXyloNetRoute])

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
    // Use Coco amount for the flip since it's the baseline reserve output
    const flipDisplay = cocoAmountRaw > BigInt(0) ? formatTokenAmount(cocoAmountRaw, toToken.decimals) : ''
    setFromAmount(flipDisplay)
    // Clear any stale transaction progress from previous direction
    txProgress.clearFlow()
    // Reset approval/swap state for the new direction
    resetApproval()
    resetCocoSwap()
    resetXyloNetSwap()
    resetUnitFlowSwap()
    resetSynthraSwap()
    // Return to auto best-route selection for the new direction.
    setManualRouteId(null)
    setRouteChangedWarning(false)
  }, [fromToken, toToken, cocoAmountRaw, txProgress, resetApproval, resetCocoSwap, resetXyloNetSwap, resetUnitFlowSwap, resetSynthraSwap])

  // Button state machine
  const buttonState = useMemo(() => {
    if (!isConnected) return { text: 'Connect Wallet', disabled: true, action: 'connect' as const }
    if (isWrongNetwork) return { text: isSwitching ? 'Switching...' : 'Switch to Arc Testnet', disabled: isSwitching, action: 'switch-network' as const }
    if (reservesLoading) return { text: 'Loading...', disabled: true, action: 'loading' as const }
    if (!hasLiquidity && !isXyloNetRoute && !isUnitFlowRoute && !isSynthraRoute) return { text: 'Pool has no liquidity', disabled: true, action: 'no-liquidity' as const }
    if (!fromAmount || parseFloat(fromAmount) <= 0) return { text: 'Enter an amount', disabled: true, action: 'enter' as const }
    if (fromBalance !== undefined && fromAmountRaw > fromBalance) return { text: 'Insufficient balance', disabled: true, action: 'insufficient' as const }
    if (isFindingRoute && !activeQuote) return { text: 'Finding best route…', disabled: true, action: 'finding-route' as const }
    if (!activeQuote) return { text: noExecutableRouteReason ?? 'No executable route available for this amount', disabled: true, action: 'no-executable-route' as const }
    if (activeQuote.executionStatus === 'non_executable') return { text: 'Route is quote only', disabled: true, action: 'route-not-executable' as const }
    if (isApproving || isApprovalConfirming) return { text: `Approving ${fromToken.symbol}...`, disabled: true, action: 'approving' as const }
    if (needsApproval) return { text: `Approve ${fromToken.symbol}`, disabled: false, action: 'approve' as const }
    // IMPORTANT: simulation error check comes AFTER needsApproval.
    // If allowance is insufficient, the user must approve first — not see a simulation error.
    // The simulation would always fail without allowance (router's transferFrom reverts).
    if (xyloNetSimulationError && isXyloNetRoute) return { text: xyloNetSimulationError, disabled: true, action: 'simulation-failed' as const }
    if (unitFlowSimulationError && isUnitFlowRoute) return { text: unitFlowSimulationError, disabled: true, action: 'simulation-failed' as const }
    if (synthraSimulationError && isSynthraRoute) return { text: synthraSimulationError, disabled: true, action: 'simulation-failed' as const }
    if (isSwapping || isSwapConfirming) return {
      text: isUnitFlowRoute
        ? 'Swapping via UnitFlow...'
        : isXyloNetRoute
          ? 'Swapping via XyloNet...'
          : isSynthraRoute
            ? 'Swapping via Synthra...'
            : 'Swapping...',
      disabled: true,
      action: 'swapping' as const,
    }
    return {
      text: isUnitFlowRoute
        ? 'Swap via UnitFlow'
        : isXyloNetRoute
          ? 'Swap via XyloNet'
          : isSynthraRoute
            ? 'Swap via Synthra'
            : 'Swap',
      disabled: false,
      action: 'swap' as const,
    }
  }, [isConnected, isWrongNetwork, isSwitching, reservesLoading, hasLiquidity, fromAmount, fromBalance, fromAmountRaw, activeQuote, isFindingRoute, noExecutableRouteReason, isApproving, isApprovalConfirming, needsApproval, fromToken.symbol, isSwapping, isSwapConfirming, isXyloNetRoute, isUnitFlowRoute, isSynthraRoute, xyloNetSimulationError, unitFlowSimulationError, synthraSimulationError])

  const handleButtonClick = () => {
    if (buttonState.action === 'switch-network') {
      switchToArc()
      return
    }

    // ─── Hard guard: never start DEX actions on wrong network ───
    if (isWrongNetwork) return

    if (buttonState.action === 'approve') {
      // Start flow with approve + swap steps
      const swapLabel = isUnitFlowRoute
        ? 'Swap via UnitFlow'
        : isXyloNetRoute
          ? 'Swap via XyloNet'
          : isSynthraRoute
            ? 'Swap via Synthra'
            : 'Swap'
      txProgress.startFlow([
        { type: approveType, label: `Approve ${fromToken.symbol}` },
        { type: 'swap', label: swapLabel },
      ])
      txProgress.markWaiting(approveType)
      // Pass onHash callback to capture tx hash immediately
      approve((hash) => {
        txProgress.markSubmitted(approveType, hash)
      })
    } else if (buttonState.action === 'swap' && address) {
      // ─── Requote-before-execute guard ───
      // Never execute on a stale/non-executable quote, and surface a review
      // prompt if a better route appeared since selection. The aggregator
      // auto-refreshes quotes; here we re-validate the chosen route first.
      if (!activeQuote || activeQuote.executionStatus !== 'executable' || activeQuote.amountOut <= BigInt(0)) {
        console.warn('[SwapPage] BLOCKED: selected route is no longer executable')
        setRouteChangedWarning(true)
        return
      }
      if (isQuoteStale(activeQuote, Date.now())) {
        console.warn('[SwapPage] BLOCKED: selected route quote is stale; refresh before swapping')
        setRouteChangedWarning(true)
        return
      }
      // If following auto-select and a meaningfully better route now exists,
      // ask the user to review the updated best route before swapping.
      if (
        !isManualSelection &&
        bestQuote &&
        activeQuote.id !== bestQuote.id &&
        bestQuote.amountOut > activeQuote.amountOut
      ) {
        setRouteChangedWarning(true)
        return
      }
      // Start or continue flow with just swap step
      const swapLabel = isUnitFlowRoute
        ? 'Swap via UnitFlow'
        : isXyloNetRoute
          ? 'Swap via XyloNet'
          : isSynthraRoute
            ? 'Swap via Synthra'
            : 'Swap'
      if (!txProgress.currentFlow) {
        txProgress.startFlow([{ type: 'swap', label: swapLabel }])
      }
      txProgress.markWaiting('swap')

      if (isUnitFlowRoute) {
        if (!activeQuote || activeQuote.source !== 'unitflow') {
          console.warn('[SwapPage] BLOCKED: activeQuote is not UnitFlow')
          txProgress.markFailed('swap', 'Route mismatch — expected UnitFlow')
          return
        }
        if (fromToken.address.toLowerCase() !== USDC.address.toLowerCase() || toToken.address.toLowerCase() !== EURC.address.toLowerCase()) {
          console.warn('[SwapPage] BLOCKED: UnitFlow execution is only enabled for USDC -> EURC')
          txProgress.markFailed('swap', 'UnitFlow execution only supports USDC to EURC')
          return
        }
        if (activeQuote.amountOut <= BigInt(0) || activeQuote.minAmountOut <= BigInt(0)) {
          console.warn('[SwapPage] BLOCKED: UnitFlow quote has invalid amounts', { amountOut: activeQuote.amountOut, minAmountOut: activeQuote.minAmountOut })
          txProgress.markFailed('swap', 'Invalid UnitFlow quote amounts')
          return
        }

        unitFlowSwap(
          {
            amountIn: fromAmountRaw,
            minAmountOut: activeQuote.minAmountOut,
            account: address,
            to: address,
            deadlineMinutes: deadline,
          },
          (hash) => {
            txProgress.markSubmitted('swap', hash)
          }
        ).then((result) => {
          if (result?.status === 'SIMULATION_FAILED') {
            txProgress.markFailed('swap', result.reason)
          } else if (result?.status === 'WRONG_NETWORK') {
            txProgress.markFailed('swap', result.reason)
          }
        })
      } else if (isXyloNetRoute) {
        // ─── XyloNet route: sanity checks before execution ───
        if (!activeQuote || activeQuote.source !== 'xylonet') {
          console.warn('[SwapPage] BLOCKED: activeQuote is not XyloNet')
          txProgress.markFailed('swap', 'Route mismatch — expected XyloNet')
          return
        }
        if (activeQuote.amountOut <= BigInt(0) || activeQuote.minAmountOut <= BigInt(0)) {
          console.warn('[SwapPage] BLOCKED: XyloNet quote has invalid amounts', { amountOut: activeQuote.amountOut, minAmountOut: activeQuote.minAmountOut })
          txProgress.markFailed('swap', 'Invalid XyloNet quote amounts')
          return
        }
        if (!activeQuote.poolAddress || !activeQuote.routerAddress) {
          console.warn('[SwapPage] BLOCKED: XyloNet quote missing pool/router address')
          txProgress.markFailed('swap', 'Missing XyloNet contract addresses')
          return
        }
        // Guard: minAmountOut must not exceed amountOut (would always revert)
        if (activeQuote.minAmountOut > activeQuote.amountOut) {
          console.warn('[SwapPage] BLOCKED: XyloNet minAmountOut > amountOut', { minAmountOut: activeQuote.minAmountOut, amountOut: activeQuote.amountOut })
          txProgress.markFailed('swap', 'Min received exceeds expected output')
          return
        }
        // Guard: allowance must be sufficient (should be enforced by buttonState, but double-check)
        if (allowance < fromAmountRaw) {
          console.warn('[SwapPage] BLOCKED: XyloNet swap attempted with insufficient allowance', { allowance: allowance.toString(), required: fromAmountRaw.toString() })
          txProgress.markFailed('swap', 'Insufficient allowance — approve first')
          return
        }

        // Debug log (DEV only)
        if (import.meta.env.DEV) {
          console.log('[XyloNet Swap]', {
            route: 'xylonet',
            pool: activeQuote.poolAddress,
            tokenIn: fromToken.address,
            tokenOut: toToken.address,
            amountIn: fromAmountRaw.toString(),
            amountOut: activeQuote.amountOut.toString(),
            minAmountOut: activeQuote.minAmountOut.toString(),
            router: activeQuote.routerAddress,
            recipient: address,
            deadlineMinutes: deadline,
            allowance: allowance.toString(),
            requiredAllowance: fromAmountRaw.toString(),
            allowanceSufficient: allowance >= fromAmountRaw,
          })
        }

        // SAFETY: never use Coco minAmountOut for XyloNet route
        xyloNetSwap(
          {
            tokenIn: fromToken,
            tokenOut: toToken,
            amountIn: fromAmountRaw,
            minAmountOut: activeQuote.minAmountOut,
            slippageBps,
            account: address,
            to: address,
            deadlineMinutes: deadline,
          },
          (hash) => {
            txProgress.markSubmitted('swap', hash)
          }
        ).then((result) => {
          if (result?.status === 'SIMULATION_FAILED') {
            txProgress.markFailed('swap', result.reason)
          } else if (result?.status === 'WRONG_NETWORK') {
            txProgress.markFailed('swap', result.reason)
          }
        })
      } else if (isSynthraRoute) {
        if (!activeQuote || activeQuote.source !== 'synthra') {
          console.warn('[SwapPage] BLOCKED: activeQuote is not Synthra')
          txProgress.markFailed('swap', 'Route mismatch — expected Synthra')
          return
        }
        if (activeQuote.amountOut <= BigInt(0) || activeQuote.minAmountOut <= BigInt(0)) {
          console.warn('[SwapPage] BLOCKED: Synthra quote has invalid amounts', { amountOut: activeQuote.amountOut, minAmountOut: activeQuote.minAmountOut })
          txProgress.markFailed('swap', 'Invalid Synthra quote amounts')
          return
        }
        if (!activeQuote.routerAddress || activeQuote.routerAddress.toLowerCase() !== SYNTHRA_V3_SWAP_ROUTER_ADDRESS.toLowerCase()) {
          console.warn('[SwapPage] BLOCKED: Synthra quote missing or mismatched router address', { routerAddress: activeQuote.routerAddress })
          txProgress.markFailed('swap', 'Missing Synthra router address')
          return
        }
        if (!activeQuote.feeTier || !Number.isFinite(activeQuote.feeTier)) {
          console.warn('[SwapPage] BLOCKED: Synthra quote missing fee tier', { quoteId: activeQuote.id })
          txProgress.markFailed('swap', 'Missing Synthra fee tier')
          return
        }
        if (allowance < fromAmountRaw) {
          console.warn('[SwapPage] BLOCKED: Synthra swap attempted with insufficient allowance', { allowance: allowance.toString(), required: fromAmountRaw.toString() })
          txProgress.markFailed('swap', 'Insufficient allowance — approve first')
          return
        }

        synthraSwap(
          {
            tokenIn: fromToken,
            tokenOut: toToken,
            amountIn: fromAmountRaw,
            minAmountOut: activeQuote.minAmountOut,
            feeTier: activeQuote.feeTier,
            account: address,
            to: address,
          },
          (hash) => {
            txProgress.markSubmitted('swap', hash)
          },
        ).then((result) => {
          if (result?.status === 'SIMULATION_FAILED') {
            txProgress.markFailed('swap', result.reason)
          } else if (result?.status === 'WRONG_NETWORK') {
            txProgress.markFailed('swap', result.reason)
          }
        })
      } else {
        // ─── Coco route: use existing Coco swap hook ───
        cocoSwap(
          {
            tokenIn: fromToken,
            tokenOut: toToken,
            amountIn: fromAmountRaw,
            amountOutMin: activeQuote?.minAmountOut ?? minReceivedRaw,
            account: address,
            to: address,
            deadline: getDeadlineTimestamp(),
          },
          (hash) => {
            txProgress.markSubmitted('swap', hash)
          }
        )
      }
    }
  }

  const formattedFromBalance = fromBalance !== undefined ? formatTokenAmount(fromBalance, fromToken.decimals) : '—'
  const formattedToBalance = toBalance !== undefined ? formatTokenAmount(toBalance, toToken.decimals) : '—'
  const activeRouteSummary = activeQuote && activeQuote.amountOut > BigInt(0)
    ? activeQuote.source === 'unitflow'
      ? `${fromToken.symbol} → WUSDC → ${toToken.symbol} via UnitFlow`
      : `${fromToken.symbol} → ${toToken.symbol} via ${displayRouteSource}`
    : `${fromToken.symbol} → ${toToken.symbol} via Coco`
  const mobileQuotesSummary = hasValidFromAmount && activeQuote && activeQuote.amountOut > BigInt(0)
    ? `${displayRouteSource}: ${activeQuote.amountOutFormatted} ${toToken.symbol}`
    : hasValidFromAmount
      ? quotesLoading
        ? 'Refreshing quotes'
        : `${quotes.length} route${quotes.length === 1 ? '' : 's'} available`
      : 'Enter amount to compare'

  return (
    <div className="page-fade px-3 pb-12 pt-20 sm:px-4 sm:pt-24">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_6rem,rgba(59,130,246,0.18),transparent_34%),linear-gradient(180deg,rgba(2,6,23,0),rgba(2,6,23,0.86))] pointer-events-none" />

      <div className="relative mx-auto w-full max-w-[1060px] lg:grid lg:grid-cols-[minmax(420px,520px)_minmax(360px,460px)] lg:items-start lg:gap-6 xl:gap-8">
        <div className="w-full">
          <Card className="relative w-full p-4 sm:p-6 ring-1 ring-coco-green-500/5">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-coco-teal-400">Compare before swapping</p>
                <h2 className="mt-1 text-xl font-semibold text-coco-dark-text">Swap</h2>
              </div>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 rounded-xl border border-coco-dark-border bg-coco-dark-bg/60 text-coco-dark-muted transition-colors hover:border-coco-green-500/40 hover:text-coco-dark-text"
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
              <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-coco-red-500/10 border border-coco-red-500/20 p-3.5 shadow-coco-1">
                <Wifi className="h-4 w-4 text-coco-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-coco-red-500">Wrong network. Switch to Arc Testnet to use Coco DEX.</p>
              </div>
            )}

            {/* No liquidity banner */}
            {!isWrongNetwork && !reservesLoading && !hasLiquidity && (
              <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-coco-amber-500/10 border border-coco-amber-500/20 p-3.5 shadow-coco-1">
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
                className="p-2 rounded-xl bg-coco-dark-surface/95 border border-coco-dark-border hover:border-coco-green-500/50 text-coco-dark-muted hover:text-coco-teal-400 transition-all hover:rotate-180 duration-300 shadow-coco-1"
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

            {/* Price Info — shown when any route has a valid quote */}
            {fromAmount && parseFloat(fromAmount) > 0 && toAmountRaw > BigInt(0) && (
              <div className="mt-4 rounded-xl bg-coco-dark-bg/75 border border-coco-dark-border p-3.5 space-y-2 shadow-inner">
                <PriceRow label="Rate" value={`1 ${fromToken.symbol} = ${rate?.toFixed(6) ?? '—'} ${toToken.symbol}`} />
                {priceImpact > 0 && (
                  <PriceRow
                    label="Price Impact"
                    value={`${priceImpact.toFixed(3)}%`}
                    valueColor={priceImpact < 1 ? 'text-coco-green-500' : priceImpact < 3 ? 'text-coco-amber-500' : 'text-coco-red-500'}
                  />
                )}
                <PriceRow label="Min. Received" value={`${minReceivedDisplay} ${toToken.symbol}`} />
                <PriceRow label="Route" value={activeRouteSummary} />
                <PriceRow label="Slippage Tolerance" value={`${slippage}%`} />
              </div>
            )}

            {/* Best route card — compact summary near the swap action */}
            {hasValidFromAmount && (
              <BestRouteCard
                isFinding={isFindingRoute}
                bestQuote={bestQuote}
                activeQuote={activeQuote}
                isManualSelection={isManualSelection}
                noExecutableRouteReason={noExecutableRouteReason}
                outputSymbol={toToken.symbol}
                nowMs={clockMs}
              />
            )}

            {/* Best route changed — review prompt before swapping */}
            {routeChangedWarning && (
              <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-coco-amber-500/10 border border-coco-amber-500/25 p-3.5 shadow-coco-1">
                <AlertTriangle className="h-4 w-4 text-coco-amber-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-coco-amber-500">Best route changed. Review updated route before swapping.</p>
                  <button
                    type="button"
                    onClick={() => { setManualRouteId(null); setRouteChangedWarning(false) }}
                    className="mt-1 text-[11px] font-medium text-coco-teal-400 hover:text-coco-teal-300"
                  >
                    Use best route
                  </button>
                </div>
              </div>
            )}

            {/* Swap Button */}
            <button
              disabled={buttonState.disabled}
              onClick={handleButtonClick}
              className={`mt-6 w-full py-3.5 rounded-xl font-medium text-base transition-all ${
                buttonState.disabled
                  ? 'bg-coco-dark-border text-coco-dark-muted cursor-not-allowed'
                  : 'bg-coco-green-500 text-white hover:bg-coco-green-600 active:scale-[0.99] shadow-lg shadow-coco-green-500/25 hover:shadow-coco-green-500/35 hover:-translate-y-0.5'
              }`}
            >
              {buttonState.text}
            </button>
          </Card>

          <div className="mt-4">
            <TransactionProgressPanel
              currentFlow={txProgress.currentFlow}
              history={txProgress.history}
              onClear={txProgress.clearFlow}
              onCheckStatus={handleCheckStatus}
            />
          </div>
        </div>

        <div className="mt-4 lg:hidden">
          <button
            type="button"
            onClick={() => setShowQuotesMobile((value) => !value)}
            className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-coco-dark-border bg-coco-dark-surface/80 px-3 py-2.5 text-left shadow-coco-1 backdrop-blur-xl transition-colors hover:border-coco-green-500/35"
            aria-expanded={showQuotesMobile}
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-coco-dark-text">Route Quotes</span>
              <span className="block truncate text-[11px] text-coco-dark-muted">{mobileQuotesSummary}</span>
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-coco-dark-muted transition-transform ${showQuotesMobile ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <div className={`${showQuotesMobile ? 'mt-3 block' : 'hidden'} lg:mt-0 lg:block lg:sticky lg:top-24`}>
          <div className="lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pr-1">
            <div className="mb-3 rounded-xl border border-coco-dark-border bg-coco-dark-surface/70 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-[0.2em] text-coco-dark-muted">Arc Testnet</p>
              <p className="mt-1 text-sm font-medium text-coco-dark-text">Compare before swapping</p>
              {hasValidFromAmount && activeQuote && (
                <p className="mt-1 text-[11px] text-coco-dark-muted">Selected route: {activeRouteSummary}</p>
              )}
            </div>

            {hasValidFromAmount ? (
              <QuotesPanel
                quotes={quotes}
                bestQuoteId={bestQuote?.id}
                selectedQuoteId={activeQuote?.id}
                isLoading={isFindingRoute}
                comingSoonSources={comingSoonSources}
                outputSymbol={toToken.symbol}
                onSelectQuote={handleSelectRoute}
                showAllRoutes={showAllRoutes}
                onToggleAllRoutes={() => setShowAllRoutes((value) => !value)}
                noExecutableRouteReason={noExecutableRouteReason}
              />
            ) : (
              <div className="rounded-xl bg-coco-dark-bg/75 border border-coco-dark-border p-4 text-xs text-coco-dark-muted">
                Enter an amount to compare routes and select the best quote.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function TokenInput({
  label, token, amount, onAmountChange, balance, readOnly = false, onMax,
}: {
  label: string; token: Token; amount: string; onAmountChange: (v: string) => void; balance: string; readOnly?: boolean; onMax?: () => void
}) {
  return (
    <div className="rounded-xl bg-coco-dark-bg/80 border border-coco-dark-border p-4 mt-2 transition-colors focus-within:border-coco-green-500/45">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-coco-dark-muted">{label}</span>
        <button onClick={onMax} className="text-xs text-coco-dark-muted hover:text-coco-green-500 transition-colors">
          Balance: <span className="font-mono">{balance}</span>
        </button>
      </div>
      <div className="flex items-center gap-3">
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-coco-dark-surface/90 border border-coco-dark-border hover:border-coco-green-500/50 transition-colors shrink-0">
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
          className="w-full min-w-0 bg-transparent text-right text-xl sm:text-2xl font-mono text-coco-dark-text placeholder:text-coco-dark-border outline-none"
        />
      </div>
    </div>
  )
}

const ROUTE_DISPLAY_NAME: Record<RouteQuote['source'], string> = {
  coco: 'Coco',
  coco_stable: 'Coco Native Stable',
  xylonet: 'XyloNet',
  unitflow: 'UnitFlow',
  synthra: 'Synthra',
}

function BestRouteCard({
  isFinding,
  bestQuote,
  activeQuote,
  isManualSelection,
  noExecutableRouteReason,
  outputSymbol,
  nowMs,
}: {
  isFinding: boolean
  bestQuote?: RouteQuote
  activeQuote?: RouteQuote
  isManualSelection: boolean
  noExecutableRouteReason?: string
  outputSymbol: string
  nowMs: number
}) {
  if (isFinding && !activeQuote) {
    return (
      <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-coco-dark-border bg-coco-dark-bg/75 p-3.5 text-xs text-coco-dark-muted shadow-inner">
        <Zap className="h-4 w-4 shrink-0 animate-pulse text-coco-teal-400" />
        <span>Finding best route…</span>
      </div>
    )
  }

  if (!activeQuote) {
    return (
      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-coco-amber-500/25 bg-coco-amber-500/5 p-3.5 text-xs text-coco-amber-500 shadow-inner">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <span>{noExecutableRouteReason ?? 'No executable route available for this amount'}</span>
      </div>
    )
  }

  const stale = isQuoteStale(activeQuote, nowMs)
  const isAutoBest = !isManualSelection && bestQuote?.id === activeQuote.id

  return (
    <div className="mt-4 rounded-xl border border-coco-green-500/25 bg-coco-green-500/5 p-3.5 shadow-inner">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-coco-green-500/15 px-2 py-0.5 text-[10px] font-semibold text-coco-green-500">
              <Zap className="h-3 w-3" />
              {isAutoBest ? 'Best route' : 'Selected route'}
            </span>
            <span className="truncate text-sm font-semibold text-coco-dark-text">{ROUTE_DISPLAY_NAME[activeQuote.source]}</span>
            {isFinding && <span className="text-[10px] text-coco-dark-muted">refreshing…</span>}
          </div>
          <p className="mt-1 truncate text-[11px] text-coco-dark-muted">{activeQuote.routePath.join(' → ')}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-base text-coco-dark-text">{activeQuote.amountOutFormatted} {outputSymbol}</p>
          <p className="text-[11px] text-coco-dark-muted">{stale ? 'Quote stale' : 'Fresh quote'}</p>
        </div>
      </div>
    </div>
  )
}

function QuotesPanel({
  quotes,
  bestQuoteId,
  selectedQuoteId,
  isLoading,
  comingSoonSources,
  outputSymbol,
  onSelectQuote,
  showAllRoutes,
  onToggleAllRoutes,
  noExecutableRouteReason,
}: {
  quotes: RouteQuote[]
  bestQuoteId?: string
  selectedQuoteId?: string
  isLoading: boolean
  comingSoonSources: Array<{ source: 'unitflow' | 'synthra'; label: string }>
  outputSymbol: string
  onSelectQuote: (quoteId: string) => void
  showAllRoutes: boolean
  onToggleAllRoutes: () => void
  noExecutableRouteReason?: string
}) {
  const routeDetailBySource: Record<RouteQuote['source'], string> = {
    coco: 'Direct pool',
    coco_stable: 'Shadow quote',
    xylonet: 'External router',
    unitflow: 'Universal router',
    synthra: 'V3 route',
  }

  // Executable routes first (sorted best-first by output), blocked/quote-only below.
  const executableQuotes = quotes
    .filter((q) => q.availabilityStatus === 'available' && q.executionStatus === 'executable' && q.amountOut > BigInt(0))
    .sort((a, b) => (a.amountOut === b.amountOut ? 0 : a.amountOut > b.amountOut ? -1 : 1))
  const otherQuotes = quotes.filter((q) => !executableQuotes.includes(q))
  const hasExecutable = executableQuotes.length > 0
  const orderedQuotes = [...executableQuotes, ...(showAllRoutes ? otherQuotes : [])]

  return (
    <div className="rounded-xl bg-coco-dark-bg/75 border border-coco-dark-border p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-coco-dark-text">Route quotes</h3>
          <p className="text-[11px] text-coco-dark-muted">Best executable route is auto-selected. Compare before swapping.</p>
        </div>
        {isLoading && <span className="text-[11px] text-coco-dark-muted">Finding best route…</span>}
      </div>

      {!hasExecutable && !isLoading && (
        <div className="rounded-lg border border-coco-amber-500/25 bg-coco-amber-500/5 p-3 text-xs text-coco-amber-500">
          {noExecutableRouteReason ?? 'No executable route available for this amount'}
        </div>
      )}

      <div className="space-y-2">
        {quotes.length === 0 && (
          <div className="rounded-lg border border-coco-dark-border bg-coco-dark-surface p-3 text-xs text-coco-dark-muted">
            No routes available.
          </div>
        )}

        {orderedQuotes.map((quote) => {
          const isBest = quote.id === bestQuoteId
          const isSelected = quote.id === selectedQuoteId
          const isAvailable = quote.availabilityStatus === 'available'
          const isLoadingQuote = quote.availabilityStatus === 'loading'
          const isUnavailable = quote.availabilityStatus === 'unavailable'
          const isQuoteOnly = quote.executionStatus === 'non_executable' && isAvailable
          const isExecutable = quote.executionStatus === 'executable' && isAvailable
          const sourceDetail = routeDetailBySource[quote.source]
          const routeTypeLabel = quote.source === 'coco'
            ? 'Live route'
            : quote.source === 'coco_stable'
              ? 'Shadow only'
              : 'External route'
          const pathStart = quote.routePath[0] ?? ''
          const pathEnd = quote.routePath[quote.routePath.length - 1] ?? ''
          const compactPath = quote.source === 'unitflow'
            ? quote.routePath.join(' → ')
            : `${pathStart} → ${pathEnd}`
          const routeNotice = isUnavailable
            ? quote.unavailableReason
            : isLoadingQuote
              ? 'Loading quote'
              : isQuoteOnly
                ? quote.blockedReason ?? 'Quote available. Execution is disabled for this route.'
                : quote.warning

          return (
            <button
              key={quote.id}
              type="button"
              // Only executable routes are selectable. Quote-only / shadow /
              // unavailable routes are informational and cannot be selected/executed.
              aria-disabled={!isExecutable}
              aria-pressed={isSelected}
              onClick={() => {
                if (isExecutable) onSelectQuote(quote.id)
              }}
              className={`w-full rounded-lg border p-2.5 text-left transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                isSelected
                  ? 'border-blue-500/65 bg-blue-500/10 shadow-lg shadow-blue-500/15'
                  : isUnavailable
                    ? 'border-coco-red-500/20 bg-coco-red-500/5'
                    : isLoadingQuote
                      ? 'border-coco-dark-border bg-coco-dark-surface/80 cursor-wait'
                      : isQuoteOnly
                        ? 'border-coco-amber-500/25 bg-coco-amber-500/5 hover:border-coco-amber-500/45'
                        : isBest
                    ? 'border-blue-500/35 bg-coco-dark-surface/90'
                    : 'border-coco-dark-border bg-coco-dark-surface/85 hover:-translate-y-0.5 hover:border-coco-green-500/30'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-sm font-medium ${isUnavailable ? 'text-coco-dark-muted' : 'text-coco-dark-text'}`}>{quote.label}</span>
                    {isBest && isExecutable && <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium text-blue-400">Best route</span>}
                    <span className="rounded-full bg-coco-dark-border/55 px-2 py-0.5 text-[10px] font-medium text-coco-dark-muted">{routeTypeLabel}</span>
                    {isExecutable && <span className="rounded-full bg-coco-green-500/15 px-2 py-0.5 text-[10px] font-medium text-coco-green-500">Executable</span>}
                    {quote.source === 'coco_stable' && <span className="rounded-full bg-coco-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-coco-amber-500">Shadow</span>}
                    {isQuoteOnly && <span className="rounded-full bg-coco-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-coco-amber-500">Quote only</span>}
                    {isLoadingQuote && <span className="rounded-full bg-coco-dark-border/60 px-2 py-0.5 text-[10px] font-medium text-coco-dark-muted">Loading</span>}
                    {isUnavailable && <span className="rounded-full bg-coco-red-500/15 px-2 py-0.5 text-[10px] font-medium text-coco-red-500">Unavailable</span>}
                  </div>
                  <p className="mt-1 text-[11px] text-coco-dark-muted">{sourceDetail}</p>
                  <p className="mt-0.5 text-[11px] text-coco-dark-muted">{compactPath}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-base text-coco-dark-text">{quote.amountOutFormatted} {outputSymbol}</p>
                  <p className="text-[11px] text-coco-dark-muted">
                    {quote.minAmountOut > BigInt(0) ? `Min ${formatTokenAmount(quote.minAmountOut)} ${outputSymbol}` : 'Quote unavailable'}
                  </p>
                </div>
              </div>
              {routeNotice && (
                <div className={`mt-2 flex items-start gap-1.5 rounded-md px-2 py-1.5 text-[11px] ${
                  isUnavailable
                    ? 'bg-coco-red-500/8 text-coco-red-500'
                    : 'bg-coco-amber-500/8 text-coco-amber-500'
                }`}>
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 opacity-85" />
                  <span>{routeNotice}</span>
                </div>
              )}
            </button>
          )
        })}

        {otherQuotes.length > 0 && (
          <button
            type="button"
            onClick={onToggleAllRoutes}
            aria-expanded={showAllRoutes}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-coco-dark-border bg-coco-dark-surface/70 px-3 py-2 text-left text-[11px] font-medium text-coco-dark-muted transition-colors hover:border-coco-teal-400/30 hover:text-coco-dark-text focus:outline-none focus:ring-2 focus:ring-coco-teal-400/40"
          >
            <span>{showAllRoutes ? 'Hide other routes' : `View all routes (${otherQuotes.length} quote-only / unavailable)`}</span>
            <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${showAllRoutes ? 'rotate-180' : ''}`} />
          </button>
        )}

        {comingSoonSources.map((source) => (
          <button
            key={source.source}
            type="button"
            aria-disabled="true"
            className="w-full rounded-lg border border-dashed border-coco-dark-border bg-coco-dark-surface/60 p-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-coco-green-500/50"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-coco-dark-muted">{source.label}</span>
              <span className="rounded-full bg-coco-dark-border/50 px-2 py-0.5 text-[10px] font-medium text-coco-dark-muted">Quote only</span>
            </div>
            <div className="mt-2 flex items-start gap-2 rounded-lg bg-coco-dark-border/30 px-2.5 py-2 text-[11px] text-coco-dark-muted">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>Quote is visible, execution is disabled.</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function SwapSettings({ slippage, setSlippage, deadline, setDeadline, approvalMode, setApprovalMode }: { slippage: number; setSlippage: (v: number) => string | null; deadline: number; setDeadline: (v: number) => string | null; approvalMode: ApprovalMode; setApprovalMode: (v: ApprovalMode) => void }) {
  const presets = [0.1, 0.5, 1.0]
  return (
    <div className="mb-4 rounded-xl bg-coco-dark-bg/80 border border-coco-dark-border p-4 space-y-4 shadow-inner">
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
