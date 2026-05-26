import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/common/Card'
import { TokenIcon } from '@/components/common/TokenIcon'
import { MOCK_USER_POSITIONS } from '@/constants/mock'
import { ArrowLeft, ArrowDown } from 'lucide-react'
import { useAccount } from 'wagmi'

const PERCENTAGE_PRESETS = [25, 50, 75, 100]

export function RemoveLiquidityPage() {
  const { isConnected } = useAccount()
  const [percentage, setPercentage] = useState(0)
  const position = MOCK_USER_POSITIONS[0]!

  const token0Out = ((position.token0Amount * percentage) / 100).toFixed(2)
  const token1Out = ((position.token1Amount * percentage) / 100).toFixed(2)

  const getButtonState = () => {
    if (!isConnected) return { text: 'Connect Wallet', disabled: true }
    if (percentage === 0) return { text: 'Select amount', disabled: true }
    return { text: 'Remove', disabled: false }
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
          <h2 className="text-xl font-semibold text-coco-dark-text">Remove Liquidity</h2>
        </div>


        {/* Amount */}
        <div className="rounded-xl bg-coco-dark-bg border border-coco-dark-border p-5">
          <p className="text-sm text-coco-dark-muted mb-3">Amount to remove</p>
          <p className="text-4xl font-bold font-mono text-coco-dark-text mb-4">{percentage}%</p>

          {/* Slider */}
          <input
            type="range"
            min={0}
            max={100}
            value={percentage}
            onChange={(e) => setPercentage(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none bg-coco-dark-border cursor-pointer accent-coco-green-500"
          />

          {/* Preset Buttons */}
          <div className="flex gap-2 mt-4">
            {PERCENTAGE_PRESETS.map((val) => (
              <button
                key={val}
                onClick={() => setPercentage(val)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  percentage === val
                    ? 'bg-coco-green-500/10 text-coco-green-500 border border-coco-green-500/30'
                    : 'bg-coco-dark-surface border border-coco-dark-border text-coco-dark-muted hover:text-coco-dark-text'
                }`}
              >
                {val}%
              </button>
            ))}
          </div>
        </div>

        {/* Arrow */}
        <div className="flex justify-center my-3">
          <ArrowDown className="h-5 w-5 text-coco-dark-muted" />
        </div>

        {/* You Will Receive */}
        <div className="rounded-xl bg-coco-dark-bg border border-coco-dark-border p-5">
          <p className="text-sm text-coco-dark-muted mb-3">You will receive</p>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TokenIcon symbol={position.token0} color="#2775CA" size="sm" />
                <span className="text-sm font-medium text-coco-dark-text">{position.token0}</span>
              </div>
              <span className="text-lg font-mono text-coco-dark-text">{token0Out}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TokenIcon symbol={position.token1} color="#1434CB" size="sm" />
                <span className="text-sm font-medium text-coco-dark-text">{position.token1}</span>
              </div>
              <span className="text-lg font-mono text-coco-dark-text">{token1Out}</span>
            </div>
          </div>
        </div>

        {/* Remove Button */}
        <button
          disabled={buttonState.disabled}
          className={`mt-6 w-full py-3.5 rounded-xl font-medium text-base transition-all ${
            buttonState.disabled
              ? 'bg-coco-dark-border text-coco-dark-muted cursor-not-allowed'
              : 'bg-coco-red-500 text-white hover:bg-coco-red-500/90 active:scale-[0.99]'
          }`}
        >
          {buttonState.text}
        </button>
      </Card>
    </div>
  )
}
