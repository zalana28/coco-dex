import { useState } from 'react'
import { Card } from '@/components/common/Card'
import { TokenIcon } from '@/components/common/TokenIcon'
import { Settings, ArrowDownUp, ChevronDown, Info } from 'lucide-react'
import { USDC, EURC } from '@/config/tokens'
import { MOCK_EXCHANGE_RATE } from '@/constants/mock'
import { useAccount } from 'wagmi'
import type { Token } from '@/types/token'

export function SwapPage() {
  const { isConnected } = useAccount()
  const [fromToken] = useState<Token>(USDC)
  const [toToken] = useState<Token>(EURC)
  const [fromAmount, setFromAmount] = useState('')
  const [slippage] = useState(0.5)
  const [showSettings, setShowSettings] = useState(false)

  const toAmount = fromAmount ? (parseFloat(fromAmount) * MOCK_EXCHANGE_RATE).toFixed(6).replace(/\.?0+$/, '') : ''

  const priceImpact = fromAmount && parseFloat(fromAmount) > 0 ? Math.min(parseFloat(fromAmount) * 0.001, 5) : 0
  const minReceived = toAmount ? (parseFloat(toAmount) * (1 - slippage / 100)).toFixed(4) : ''

  const getButtonState = () => {
    if (!isConnected) return { text: 'Connect Wallet', disabled: true }
    if (!fromAmount || parseFloat(fromAmount) === 0) return { text: 'Enter an amount', disabled: true }
    return { text: 'Swap', disabled: false }
  }

  const buttonState = getButtonState()

  return (
    <div className="pt-24 pb-12 px-4 flex flex-col items-center">
      {/* Subtle background effect */}
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

        {/* Slippage Settings */}
        {showSettings && (
          <SlippageSettings slippage={slippage} />
        )}

        {/* From Token Input */}
        <TokenInput
          label="From"
          token={fromToken}
          amount={fromAmount}
          onAmountChange={setFromAmount}
          balance="1,000.00"
        />

        {/* Swap Direction */}
        <div className="flex justify-center -my-2 relative z-10">
          <button className="p-2 rounded-xl bg-coco-dark-surface border border-coco-dark-border hover:border-coco-green-500/50 text-coco-dark-muted hover:text-coco-green-500 transition-all hover:rotate-180 duration-300">
            <ArrowDownUp className="h-4 w-4" />
          </button>
        </div>

        {/* To Token Input */}
        <TokenInput
          label="To"
          token={toToken}
          amount={toAmount}
          onAmountChange={() => {}}
          balance="500.00"
          readOnly
        />

        {/* Price Info */}
        {fromAmount && parseFloat(fromAmount) > 0 && (
          <div className="mt-4 rounded-xl bg-coco-dark-bg border border-coco-dark-border p-3.5 space-y-2">
            <PriceRow label="Rate" value={`1 ${fromToken.symbol} = ${MOCK_EXCHANGE_RATE} ${toToken.symbol}`} />
            <PriceRow
              label="Price Impact"
              value={`${priceImpact.toFixed(3)}%`}
              valueColor={priceImpact < 1 ? 'text-coco-green-500' : priceImpact < 3 ? 'text-coco-amber-500' : 'text-coco-red-500'}
            />
            <PriceRow label="Min. Received" value={`${minReceived} ${toToken.symbol}`} />
            <PriceRow label="Route" value={`${fromToken.symbol} → ${toToken.symbol}`} />
            <PriceRow label="Slippage Tolerance" value={`${slippage}%`} />
          </div>
        )}

        {/* Swap Button */}
        <button
          disabled={buttonState.disabled}
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
  label,
  token,
  amount,
  onAmountChange,
  balance,
  readOnly = false,
}: {
  label: string
  token: Token
  amount: string
  onAmountChange: (v: string) => void
  balance: string
  readOnly?: boolean
}) {
  return (
    <div className="rounded-xl bg-coco-dark-bg border border-coco-dark-border p-4 mt-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-coco-dark-muted">{label}</span>
        <span className="text-xs text-coco-dark-muted">
          Balance: <span className="font-mono">{balance}</span>
        </span>
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

function SlippageSettings({ slippage }: { slippage: number }) {
  const presets = [0.1, 0.5, 1.0]
  return (
    <div className="mb-4 rounded-xl bg-coco-dark-bg border border-coco-dark-border p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <Info className="h-3.5 w-3.5 text-coco-dark-muted" />
        <span className="text-xs text-coco-dark-muted">Slippage Tolerance</span>
      </div>
      <div className="flex gap-2">
        {presets.map((val) => (
          <button
            key={val}
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
            className="w-full bg-transparent text-sm text-coco-dark-text placeholder:text-coco-dark-muted outline-none font-mono"
          />
          <span className="text-xs text-coco-dark-muted">%</span>
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
