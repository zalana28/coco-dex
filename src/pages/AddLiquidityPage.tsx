import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/common/Card'
import { TokenIcon } from '@/components/common/TokenIcon'
import { USDC, EURC } from '@/config/tokens'
import { MOCK_EXCHANGE_RATE } from '@/constants/mock'
import { ArrowLeft, ChevronDown, Plus, Info } from 'lucide-react'
import { useAccount } from 'wagmi'
import type { Token } from '@/types/token'

export function AddLiquidityPage() {
  const { isConnected } = useAccount()
  const [token0] = useState<Token>(USDC)
  const [token1] = useState<Token>(EURC)
  const [amount0, setAmount0] = useState('')
  const [amount1, setAmount1] = useState('')

  // Auto-fill second amount based on rate
  const handleAmount0Change = (val: string) => {
    setAmount0(val)
    if (val && parseFloat(val) > 0) {
      setAmount1((parseFloat(val) * MOCK_EXCHANGE_RATE).toFixed(6).replace(/\.?0+$/, ''))
    } else {
      setAmount1('')
    }
  }

  const handleAmount1Change = (val: string) => {
    setAmount1(val)
    if (val && parseFloat(val) > 0) {
      setAmount0((parseFloat(val) / MOCK_EXCHANGE_RATE).toFixed(6).replace(/\.?0+$/, ''))
    } else {
      setAmount0('')
    }
  }

  const poolShare = amount0 && parseFloat(amount0) > 0
    ? Math.min((parseFloat(amount0) / (1_200_000 + parseFloat(amount0))) * 100, 100)
    : 0

  const getButtonState = () => {
    if (!isConnected) return { text: 'Connect Wallet', disabled: true }
    if (!amount0 || parseFloat(amount0) === 0) return { text: 'Enter an amount', disabled: true }
    return { text: 'Supply', disabled: false }
  }

  const buttonState = getButtonState()

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


        {/* First Token Input */}
        <LiquidityTokenInput
          token={token0}
          amount={amount0}
          onAmountChange={handleAmount0Change}
          balance="1,000.00"
        />

        {/* Plus separator */}
        <div className="flex justify-center -my-2 relative z-10">
          <div className="p-2 rounded-xl bg-coco-dark-surface border border-coco-dark-border">
            <Plus className="h-4 w-4 text-coco-dark-muted" />
          </div>
        </div>

        {/* Second Token Input */}
        <LiquidityTokenInput
          token={token1}
          amount={amount1}
          onAmountChange={handleAmount1Change}
          balance="500.00"
        />

        {/* Price and Pool Share */}
        {amount0 && parseFloat(amount0) > 0 && (
          <div className="mt-4 rounded-xl bg-coco-dark-bg border border-coco-dark-border p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Info className="h-3.5 w-3.5 text-coco-dark-muted" />
              <span className="text-xs text-coco-dark-muted">Prices and pool share</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <PriceStat label={`${token1.symbol} per ${token0.symbol}`} value={MOCK_EXCHANGE_RATE.toFixed(4)} />
              <PriceStat label={`${token0.symbol} per ${token1.symbol}`} value={(1 / MOCK_EXCHANGE_RATE).toFixed(4)} />
              <PriceStat label="Share of pool" value={`${poolShare.toFixed(4)}%`} />
            </div>
          </div>
        )}

        {/* Supply Button */}
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


function LiquidityTokenInput({
  token,
  amount,
  onAmountChange,
  balance,
}: {
  token: Token
  amount: string
  onAmountChange: (v: string) => void
  balance: string
}) {
  return (
    <div className="rounded-xl bg-coco-dark-bg border border-coco-dark-border p-4 mt-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-coco-dark-muted">Input</span>
        <button
          onClick={() => onAmountChange(balance.replace(/,/g, ''))}
          className="text-xs text-coco-dark-muted hover:text-coco-green-500 transition-colors"
        >
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
