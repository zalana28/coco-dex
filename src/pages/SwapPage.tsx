import { useState, useMemo } from 'react'
import { Card } from '@/components/common/Card'
import { TokenIcon } from '@/components/common/TokenIcon'
import { Settings, ArrowDownUp, ChevronDown, Info, AlertTriangle, Wifi } from 'lucide-react'
import { USDC, EURC } from '@/config/tokens'
import { ROUTER_ADDRESS } from '@/config/contracts'
import { useAccount } from 'wagmi'
import { usePairReserves } from '@/hooks/usePairReserves'
import { useTokenBalance } from '@/hooks/useTokenBalance'
import { useApprove } from '@/hooks/useApprove'
import { useSwap } from '@/hooks/useSwap'
import { useNetworkGuard } from '@/hooks/useNetworkGuard'
import { useTransactionSettings } from '@/hooks/useSettings'
import { formatTokenAmount, parseTokenAmount } from '@/utils/format'
import { getAmountOut, calculatePriceImpact, calculateMinimumReceived } from '@/utils/price'
import type { Token } from '@/types/token'

export function SwapPage() {
  const { address, isConnected } = useAccount()
  const [fromToken] = useState<Token>(USDC)
  const [toToken] = useState<Token>(EURC)
  const [fromAmount, setFromAmount] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const { slippage, slippageBps, setSlippage, getDeadlineTimestamp, deadline, setDeadline } = useTransactionSettings()

  // Network guard — require Arc Testnet for all DEX operations
  const { isWrongNetwork, switchToArc, isSwitching } = useNetworkGuard()

  // Live reserves
  const { reserveUsdc, reserveEurc, rate, hasLiquidity, isLoading: reservesLoading } = usePairReserves()

  // Live balances (ERC-20, 6 decimals — NOT native 18-decimal gas)
  const { balance: fromBalance } = useTokenBalance(fromToken, address)
  const { balance: toBalance } = useTokenBalance(toToken, address)

  // Parse input to bigint
  const fromAmountRaw = useMemo(() => {
    if (!fromAmount || parseFloat(fromAmount) <= 0) return BigInt(0)
    return parseTokenAmount(fromAmount, fromToken.decimals)
  }, [fromAmount, fromToken.decimals])

  // Compute output from live reserves
  const { toAmountRaw, toAmountDisplay, priceImpact, minReceivedRaw, minReceivedDisplay } = useMemo(() => {
    if (!hasLiquidity || fromAmountRaw <= BigInt(0) || !reserveUsdc || !reserveEurc) {
      return { toAmountRaw: BigInt(0), toAmountDisplay: '', priceImpact: 0, minReceivedRaw: BigInt(0), minReceivedDisplay: '' }
    }

    // Determine reserve order based on token direction
    const rIn = fromToken.address.toLowerCase() === USDC.address.toLowerCase() ? reserveUsdc : reserveEurc
    const rOut = fromToken.address.toLowerCase() === USDC.address.toLowerCase() ? reserveEurc : reserveUsdc

    const out = getAmountOut(fromAmountRaw, rIn, rOut)
    const impact = calculatePriceImpact(fromAmountRaw, out, rIn, rOut)
    const minRec = calculateMinimumReceived(out, slippageBps)

    return {
      toAmountRaw: out,
      toAmountDisplay: formatTokenAmount(out, toToken.decimals),
      priceImpact: impact,
      minReceivedRaw: minRec,
      minReceivedDisplay: formatTokenAmount(minRec, toToken.decimals),
    }
  }, [hasLiquidity, fromAmountRaw, reserveUsdc, reserveEurc, fromToken, toToken, slippageBps])

  // Approval
  const { needsApproval, approve, isApproving, isWaitingForReceipt: isApprovalConfirming } = useApprove(
    fromToken,
    ROUTER_ADDRESS,
    fromAmountRaw
  )

  // Swap execution
  const { swap, isPending: isSwapping, isConfirming: isSwapConfirming } = useSwap()

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
    } else if (buttonState.action === 'approve') {
      approve()
    } else if (buttonState.action === 'swap' && address) {
      swap({
        tokenIn: fromToken,
        tokenOut: toToken,
        amountIn: fromAmountRaw,
        amountOutMin: minReceivedRaw,
        to: address,
        deadline: getDeadlineTimestamp(),
      })
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
          <SwapSettings slippage={slippage} setSlippage={setSlippage} deadline={deadline} setDeadline={setDeadline} />
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

        {/* Direction toggle */}
        <div className="flex justify-center -my-2 relative z-10">
          <button className="p-2 rounded-xl bg-coco-dark-surface border border-coco-dark-border hover:border-coco-green-500/50 text-coco-dark-muted hover:text-coco-green-500 transition-all hover:rotate-180 duration-300">
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

function SwapSettings({ slippage, setSlippage, deadline, setDeadline }: { slippage: number; setSlippage: (v: number) => string | null; deadline: number; setDeadline: (v: number) => string | null }) {
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
