import { useState, useMemo, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/common/Card'
import { TokenIcon } from '@/components/common/TokenIcon'
import { TransactionProgressPanel } from '@/components/transactions/TransactionProgressPanel'
import { USDC, EURC } from '@/config/tokens'
import { ROUTER_ADDRESS } from '@/config/contracts'
import { ArrowLeft, ChevronDown, Plus, Info, Wifi } from 'lucide-react'
import { useAccount } from 'wagmi'
import { usePairReserves } from '@/hooks/usePairReserves'
import { useTokenBalance } from '@/hooks/useTokenBalance'
import { useApprove } from '@/hooks/useApprove'
import { useAddLiquidity } from '@/hooks/useAddLiquidity'
import { useLPBalance } from '@/hooks/useLPBalance'
import { useNetworkGuard } from '@/hooks/useNetworkGuard'
import { useTransactionSettings } from '@/hooks/useSettings'
import { useTransactionProgress } from '@/hooks/useTransactionProgress'
import { formatTokenAmount, parseTokenAmount } from '@/utils/format'
import type { Token } from '@/types/token'

export function AddLiquidityPage() {
  const { address, isConnected } = useAccount()
  const [token0] = useState<Token>(USDC)
  const [token1] = useState<Token>(EURC)
  const [amount0, setAmount0] = useState('')
  const [amount1, setAmount1] = useState('')
  const { getDeadlineTimestamp, slippageBps } = useTransactionSettings()

  // Network guard — require Arc Testnet
  const { isWrongNetwork, switchToArc, isSwitching } = useNetworkGuard()

  // Live reserves
  const { reserveUsdc, reserveEurc, hasLiquidity } = usePairReserves()

  // Live balances (ERC-20, 6 decimals)
  const { balance: balance0 } = useTokenBalance(token0, address)
  const { balance: balance1 } = useTokenBalance(token1, address)

  // LP balance for pool share
  const { totalSupply } = useLPBalance(address)

  // Parse amounts
  const amount0Raw = useMemo(() => {
    if (!amount0 || parseFloat(amount0) <= 0) return BigInt(0)
    return parseTokenAmount(amount0, token0.decimals)
  }, [amount0, token0.decimals])

  const amount1Raw = useMemo(() => {
    if (!amount1 || parseFloat(amount1) <= 0) return BigInt(0)
    return parseTokenAmount(amount1, token1.decimals)
  }, [amount1, token1.decimals])

  // Autofill second amount from reserves ratio (only for non-empty pool)
  const handleAmount0Change = (val: string) => {
    setAmount0(val)
    if (hasLiquidity && reserveUsdc && reserveEurc && val && parseFloat(val) > 0) {
      const raw0 = parseTokenAmount(val, token0.decimals)
      // quote: amount1 = amount0 * reserveEurc / reserveUsdc
      const optimal1 = (raw0 * reserveEurc) / reserveUsdc
      setAmount1(formatTokenAmount(optimal1, token1.decimals))
    } else if (!hasLiquidity) {
      // Empty pool: user sets both freely
    } else {
      setAmount1('')
    }
  }

  const handleAmount1Change = (val: string) => {
    setAmount1(val)
    if (hasLiquidity && reserveUsdc && reserveEurc && val && parseFloat(val) > 0) {
      const raw1 = parseTokenAmount(val, token1.decimals)
      const optimal0 = (raw1 * reserveUsdc) / reserveEurc
      setAmount0(formatTokenAmount(optimal0, token0.decimals))
    } else if (!hasLiquidity) {
      // Empty pool: user sets both freely
    } else {
      setAmount0('')
    }
  }

  // Pool share calculation
  const poolShare = useMemo(() => {
    if (!hasLiquidity) return amount0Raw > BigInt(0) ? 100 : 0
    if (!totalSupply || totalSupply <= BigInt(0) || !reserveUsdc || reserveUsdc <= BigInt(0)) return 0
    if (amount0Raw <= BigInt(0)) return 0
    // New LP minted ≈ amount0 * totalSupply / reserveUsdc
    const newLp = (amount0Raw * totalSupply) / reserveUsdc
    const share = Number(newLp) / Number(totalSupply + newLp) * 100
    return share
  }, [hasLiquidity, amount0Raw, totalSupply, reserveUsdc])

  // Approvals
  const approveUsdc = useApprove(token0, ROUTER_ADDRESS, amount0Raw)
  const approveEurc = useApprove(token1, ROUTER_ADDRESS, amount1Raw)

  // Add liquidity hook
  const { addLiquidity, isPending: isSupplying, isConfirming: isSupplyConfirming, txHash: supplyTxHash, isSuccess: supplySuccess, error: supplyError } = useAddLiquidity()

  // Transaction progress tracking (strict sequential)
  const txProgress = useTransactionProgress()

  // Sync USDC approval tx hash → markSubmitted
  useEffect(() => {
    if (!txProgress.currentFlow || !approveUsdc.approvalTxHash) return
    const step = txProgress.currentFlow.steps.find((s) => s.type === 'approve_usdc')
    if (!step || step.status !== 'waiting_wallet_confirmation') return
    txProgress.markSubmitted('approve_usdc', approveUsdc.approvalTxHash)
  }, [approveUsdc.approvalTxHash, txProgress])

  // Sync USDC approval receipt → markSuccess/markFailed
  useEffect(() => {
    if (!txProgress.currentFlow) return
    const step = txProgress.currentFlow.steps.find((s) => s.type === 'approve_usdc')
    if (!step || step.status === 'success' || step.status === 'idle') return

    if (approveUsdc.isApproved) {
      txProgress.markSuccess('approve_usdc')
    } else if (approveUsdc.isReverted) {
      txProgress.markFailed('approve_usdc', 'Transaction reverted')
    } else if (approveUsdc.error) {
      const msg = approveUsdc.error.message || 'Approval failed'
      if (msg.includes('rejected') || msg.includes('denied')) {
        txProgress.markRejected('approve_usdc')
      } else {
        txProgress.markFailed('approve_usdc', msg.slice(0, 80))
      }
    }
  }, [approveUsdc.isApproved, approveUsdc.isReverted, approveUsdc.error, txProgress])

  // Sync EURC approval tx hash → markSubmitted
  useEffect(() => {
    if (!txProgress.currentFlow || !approveEurc.approvalTxHash) return
    const step = txProgress.currentFlow.steps.find((s) => s.type === 'approve_eurc')
    if (!step || step.status !== 'waiting_wallet_confirmation') return
    txProgress.markSubmitted('approve_eurc', approveEurc.approvalTxHash)
  }, [approveEurc.approvalTxHash, txProgress])

  // Sync EURC approval receipt → markSuccess/markFailed
  useEffect(() => {
    if (!txProgress.currentFlow) return
    const step = txProgress.currentFlow.steps.find((s) => s.type === 'approve_eurc')
    if (!step || step.status === 'success' || step.status === 'idle') return

    if (approveEurc.isApproved) {
      txProgress.markSuccess('approve_eurc')
    } else if (approveEurc.isReverted) {
      txProgress.markFailed('approve_eurc', 'Transaction reverted')
    } else if (approveEurc.error) {
      const msg = approveEurc.error.message || 'Approval failed'
      if (msg.includes('rejected') || msg.includes('denied')) {
        txProgress.markRejected('approve_eurc')
      } else {
        txProgress.markFailed('approve_eurc', msg.slice(0, 80))
      }
    }
  }, [approveEurc.isApproved, approveEurc.isReverted, approveEurc.error, txProgress])

  // Sync supply state → progress panel
  useEffect(() => {
    if (!txProgress.currentFlow) return
    const step = txProgress.currentFlow.steps.find((s) => s.type === 'add_liquidity')
    if (!step || step.status === 'success' || step.status === 'idle') return

    if (supplyTxHash && step.status === 'waiting_wallet_confirmation') {
      txProgress.markSubmitted('add_liquidity', supplyTxHash)
    }
    if (supplySuccess) {
      txProgress.markSuccess('add_liquidity')
    }
    if (supplyError) {
      const msg = supplyError.message || 'Supply failed'
      if (msg.includes('rejected') || msg.includes('denied')) {
        txProgress.markRejected('add_liquidity')
      } else {
        txProgress.markFailed('add_liquidity', msg.slice(0, 80))
      }
    }
  }, [supplyTxHash, supplySuccess, supplyError])

  // Check status handler — refetch allowances/balances
  const handleCheckStatus = useCallback(() => {
    approveUsdc.refetchAllowance()
    approveEurc.refetchAllowance()
    // If allowances are now sufficient, mark success
    if (!approveUsdc.needsApproval && txProgress.currentFlow) {
      const step = txProgress.currentFlow.steps.find((s) => s.type === 'approve_usdc')
      if (step && step.status !== 'success' && step.status !== 'idle') {
        txProgress.markSuccess('approve_usdc')
      }
    }
    if (!approveEurc.needsApproval && txProgress.currentFlow) {
      const step = txProgress.currentFlow.steps.find((s) => s.type === 'approve_eurc')
      if (step && step.status !== 'success' && step.status !== 'idle') {
        txProgress.markSuccess('approve_eurc')
      }
    }
  }, [approveUsdc, approveEurc, txProgress])

  // Button state machine
  const buttonState = useMemo(() => {
    if (!isConnected) return { text: 'Connect Wallet', disabled: true, action: 'connect' as const }
    if (isWrongNetwork) return { text: isSwitching ? 'Switching...' : 'Switch to Arc Testnet', disabled: isSwitching, action: 'switch-network' as const }
    if (!amount0 || parseFloat(amount0) <= 0 || !amount1 || parseFloat(amount1) <= 0) return { text: 'Enter amounts', disabled: true, action: 'enter' as const }
    if (balance0 !== undefined && amount0Raw > balance0) return { text: 'Insufficient USDC', disabled: true, action: 'insufficient-0' as const }
    if (balance1 !== undefined && amount1Raw > balance1) return { text: 'Insufficient EURC', disabled: true, action: 'insufficient-1' as const }
    if (approveUsdc.isApproving || approveUsdc.isWaitingForReceipt) return { text: 'Approving USDC...', disabled: true, action: 'approving-0' as const }
    if (approveUsdc.needsApproval) return { text: 'Approve USDC', disabled: false, action: 'approve-0' as const }
    if (approveEurc.isApproving || approveEurc.isWaitingForReceipt) return { text: 'Approving EURC...', disabled: true, action: 'approving-1' as const }
    if (approveEurc.needsApproval) return { text: 'Approve EURC', disabled: false, action: 'approve-1' as const }
    if (isSupplying || isSupplyConfirming) return { text: 'Supplying...', disabled: true, action: 'supplying' as const }
    return { text: 'Supply', disabled: false, action: 'supply' as const }
  }, [isConnected, amount0, amount1, balance0, balance1, amount0Raw, amount1Raw, approveUsdc, approveEurc, isSupplying, isSupplyConfirming])

  const handleButtonClick = () => {
    if (buttonState.action === 'switch-network') {
      switchToArc()
      return
    }

    // ─── Hard guard: never start DEX actions on wrong network ───
    if (isWrongNetwork) return

    if (buttonState.action === 'approve-0') {
      // Start full 3-step flow
      txProgress.startFlow([
        { type: 'approve_usdc', label: 'Approve USDC' },
        { type: 'approve_eurc', label: 'Approve EURC' },
        { type: 'add_liquidity', label: 'Supply Liquidity' },
      ])
      txProgress.markWaiting('approve_usdc')
      approveUsdc.approve()
    } else if (buttonState.action === 'approve-1') {
      if (!txProgress.currentFlow) {
        txProgress.startFlow([
          { type: 'approve_eurc', label: 'Approve EURC' },
          { type: 'add_liquidity', label: 'Supply Liquidity' },
        ])
      }
      txProgress.markWaiting('approve_eurc')
      approveEurc.approve()
    } else if (buttonState.action === 'supply' && address) {
      if (!txProgress.currentFlow) {
        txProgress.startFlow([{ type: 'add_liquidity', label: 'Supply Liquidity' }])
      }
      txProgress.markWaiting('add_liquidity')
      // Apply slippage tolerance to min amounts
      const minA = (amount0Raw * BigInt(10000 - slippageBps)) / BigInt(10000)
      const minB = (amount1Raw * BigInt(10000 - slippageBps)) / BigInt(10000)
      addLiquidity({
        tokenA: token0,
        tokenB: token1,
        amountA: amount0Raw,
        amountB: amount1Raw,
        amountAMin: minA,
        amountBMin: minB,
        to: address,
        deadline: getDeadlineTimestamp(),
      })
    }
  }

  const formattedBalance0 = balance0 !== undefined ? formatTokenAmount(balance0, token0.decimals) : '—'
  const formattedBalance1 = balance1 !== undefined ? formatTokenAmount(balance1, token1.decimals) : '—'

  // Rate display
  const rateDisplay = hasLiquidity && reserveUsdc && reserveEurc && reserveUsdc > BigInt(0)
    ? (Number(reserveEurc) / Number(reserveUsdc)).toFixed(6)
    : null

  return (
    <div className="pt-24 pb-12 px-4 flex flex-col items-center">
      <Card className="relative w-full max-w-[480px] p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link to="/pools" className="p-1.5 rounded-lg hover:bg-coco-dark-bg text-coco-dark-muted hover:text-coco-dark-text transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h2 className="text-xl font-semibold text-coco-dark-text">Add Liquidity</h2>
        </div>

        {/* Wrong network banner */}
        {isWrongNetwork && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-coco-red-500/10 border border-coco-red-500/20 p-3.5">
            <Wifi className="h-4 w-4 text-coco-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-coco-red-500">Wrong network. Switch to Arc Testnet to use Coco DEX.</p>
          </div>
        )}

        {/* First liquidity provider notice */}
        {!hasLiquidity && !isWrongNetwork && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-coco-teal-400/10 border border-coco-teal-400/20 p-3.5">
            <Info className="h-4 w-4 text-coco-teal-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-coco-teal-400 font-medium">You are the first liquidity provider for this pool.</p>
              <p className="text-xs text-coco-dark-muted mt-1">The ratio of tokens you add will set the initial price. Enter both amounts freely.</p>
            </div>
          </div>
        )}

        {/* Token 0 Input */}
        <LiquidityTokenInput
          token={token0}
          amount={amount0}
          onAmountChange={handleAmount0Change}
          balance={formattedBalance0}
          onMax={() => balance0 && setAmount0(formatTokenAmount(balance0, token0.decimals))}
        />

        {/* Plus separator */}
        <div className="flex justify-center -my-2 relative z-10">
          <div className="p-2 rounded-xl bg-coco-dark-surface border border-coco-dark-border">
            <Plus className="h-4 w-4 text-coco-dark-muted" />
          </div>
        </div>

        {/* Token 1 Input */}
        <LiquidityTokenInput
          token={token1}
          amount={amount1}
          onAmountChange={handleAmount1Change}
          balance={formattedBalance1}
          onMax={() => balance1 && setAmount1(formatTokenAmount(balance1, token1.decimals))}
        />

        {/* Price and Pool Share */}
        {(amount0 && parseFloat(amount0) > 0) && (
          <div className="mt-4 rounded-xl bg-coco-dark-bg border border-coco-dark-border p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Info className="h-3.5 w-3.5 text-coco-dark-muted" />
              <span className="text-xs text-coco-dark-muted">Prices and pool share</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <PriceStat
                label={`${token1.symbol} per ${token0.symbol}`}
                value={rateDisplay ?? (amount1 && amount0 ? (parseFloat(amount1) / parseFloat(amount0)).toFixed(6) : '—')}
              />
              <PriceStat
                label={`${token0.symbol} per ${token1.symbol}`}
                value={rateDisplay ? (1 / parseFloat(rateDisplay)).toFixed(6) : (amount0 && amount1 ? (parseFloat(amount0) / parseFloat(amount1)).toFixed(6) : '—')}
              />
              <PriceStat label="Share of pool" value={`${poolShare.toFixed(2)}%`} />
            </div>
          </div>
        )}

        {/* Supply Button */}
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

function LiquidityTokenInput({
  token, amount, onAmountChange, balance, onMax,
}: {
  token: Token; amount: string; onAmountChange: (v: string) => void; balance: string; onMax?: () => void
}) {
  return (
    <div className="rounded-xl bg-coco-dark-bg border border-coco-dark-border p-4 mt-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-coco-dark-muted">Input</span>
        <button onClick={onMax} className="text-xs text-coco-dark-muted hover:text-coco-green-500 transition-colors">
          Balance: <span className="font-mono">{balance}</span>
        </button>
      </div>
      <div className="flex items-center gap-3">
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-coco-dark-surface border border-coco-dark-border shrink-0">
          <TokenIcon symbol={token.symbol} color={token.logoColor} size="sm" />
          <span className="text-sm font-medium text-coco-dark-text">{token.symbol}</span>
          <ChevronDown className="h-3.5 w-3.5 text-coco-dark-muted" />
        </button>
        <input
          type="number"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          placeholder="0.00"
          className="w-full bg-transparent text-right text-2xl font-mono text-coco-dark-text placeholder:text-coco-dark-border outline-none"
        />
      </div>
    </div>
  )
}

function PriceStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center rounded-lg bg-coco-dark-surface border border-coco-dark-border p-2">
      <p className="text-sm font-mono font-medium text-coco-dark-text">{value}</p>
      <p className="text-[10px] text-coco-dark-muted mt-0.5">{label}</p>
    </div>
  )
}
