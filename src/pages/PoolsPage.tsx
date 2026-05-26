import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/common/Card'
import { TokenIcon } from '@/components/common/TokenIcon'
import { formatCompact, formatPercentage, formatTokenAmount } from '@/utils/format'
import { Plus, Minus, Droplets, AlertTriangle } from 'lucide-react'
import { useAccount } from 'wagmi'
import { usePairReserves } from '@/hooks/usePairReserves'
import { useLPBalance } from '@/hooks/useLPBalance'
import { USDC, EURC } from '@/config/tokens'

type Tab = 'all' | 'my'

export function PoolsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('all')
  const { address, isConnected } = useAccount()
  const { reserveUsdc, reserveEurc, hasLiquidity, isLoading } = usePairReserves()
  const { balance: lpBalance, share } = useLPBalance(address)

  return (
    <div className="pt-24 pb-12 px-4 mx-auto max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-coco-dark-text">Pools</h1>
        <Link
          to="/pools/add"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-coco-green-500 text-white text-sm font-medium hover:bg-coco-green-600 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Position
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl bg-coco-dark-surface border border-coco-dark-border w-fit">
        <TabButton active={activeTab === 'all'} onClick={() => setActiveTab('all')}>All Pools</TabButton>
        <TabButton active={activeTab === 'my'} onClick={() => setActiveTab('my')}>My Positions</TabButton>
      </div>

      {activeTab === 'all' ? (
        <AllPools
          reserveUsdc={reserveUsdc}
          reserveEurc={reserveEurc}
          hasLiquidity={hasLiquidity}
          isLoading={isLoading}
        />
      ) : (
        <MyPositions
          isConnected={isConnected}
          lpBalance={lpBalance}
          share={share}
          reserveUsdc={reserveUsdc}
          reserveEurc={reserveEurc}
          hasLiquidity={hasLiquidity}
        />
      )}
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-coco-dark-bg text-coco-dark-text'
          : 'text-coco-dark-muted hover:text-coco-dark-text'
      }`}
    >
      {children}
    </button>
  )
}

function AllPools({ reserveUsdc, reserveEurc, hasLiquidity, isLoading }: {
  reserveUsdc: bigint | undefined; reserveEurc: bigint | undefined; hasLiquidity: boolean; isLoading: boolean
}) {
  const tvl = hasLiquidity && reserveUsdc && reserveEurc
    ? (Number(reserveUsdc) / 1e6) + (Number(reserveEurc) / 1e6 * 1.086) // EURC ≈ $1.086
    : 0

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              <TokenIcon symbol="USDC" color="#2775CA" size="md" />
              <TokenIcon symbol="EURC" color="#1434CB" size="md" />
            </div>
            <div>
              <h3 className="font-semibold text-coco-dark-text">USDC / EURC</h3>
              <p className="text-xs text-coco-dark-muted">0.3% fee tier</p>
            </div>
          </div>
          <div className="text-right">
            {hasLiquidity ? (
              <p className="text-sm font-medium text-coco-green-500">Active</p>
            ) : (
              <p className="text-sm font-medium text-coco-amber-500">No Liquidity</p>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-4 pt-4 border-t border-coco-dark-border">
          <div>
            <p className="text-xs text-coco-dark-muted">TVL</p>
            <p className="text-sm font-mono font-medium text-coco-dark-text">
              {isLoading ? '...' : hasLiquidity ? formatCompact(tvl) : '$0'}
            </p>
          </div>
          <div>
            <p className="text-xs text-coco-dark-muted">USDC Reserve</p>
            <p className="text-sm font-mono font-medium text-coco-dark-text">
              {isLoading ? '...' : reserveUsdc ? formatTokenAmount(reserveUsdc, 6) : '0'}
            </p>
          </div>
          <div className="flex items-end justify-end gap-2">
            <Link
              to="/pools/add"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-coco-green-500/10 text-coco-green-500 text-xs font-medium hover:bg-coco-green-500/20 transition-colors"
            >
              <Plus className="h-3 w-3" />
              Add
            </Link>
          </div>
        </div>

        {!hasLiquidity && !isLoading && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-coco-amber-500/5 border border-coco-amber-500/10 p-2.5">
            <AlertTriangle className="h-3.5 w-3.5 text-coco-amber-500 shrink-0" />
            <p className="text-[11px] text-coco-amber-500">This pool has no liquidity. Be the first to add!</p>
          </div>
        )}
      </Card>
    </div>
  )
}

function MyPositions({ isConnected, lpBalance, share, reserveUsdc, reserveEurc, hasLiquidity }: {
  isConnected: boolean; lpBalance: bigint | undefined; share: number; reserveUsdc: bigint | undefined; reserveEurc: bigint | undefined; hasLiquidity: boolean
}) {
  if (!isConnected) {
    return (
      <Card className="p-12 text-center">
        <Droplets className="h-12 w-12 text-coco-dark-muted mx-auto mb-4" />
        <h3 className="text-lg font-medium text-coco-dark-text">Connect your wallet</h3>
        <p className="mt-2 text-sm text-coco-dark-muted">Connect your wallet to view your liquidity positions.</p>
      </Card>
    )
  }

  const hasPosition = lpBalance !== undefined && lpBalance > BigInt(0)

  if (!hasPosition) {
    return (
      <Card className="p-12 text-center">
        <Droplets className="h-12 w-12 text-coco-dark-muted mx-auto mb-4" />
        <h3 className="text-lg font-medium text-coco-dark-text">You do not have a position in this pool yet.</h3>
        <p className="mt-2 text-sm text-coco-dark-muted">Add liquidity to the USDC/EURC pool to start earning trading fees.</p>
        <Link
          to="/pools/add"
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-coco-green-500 text-white text-sm font-medium hover:bg-coco-green-600 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Liquidity
        </Link>
      </Card>
    )
  }

  // Calculate user's withdrawable amounts:
  // userUSDC = reserveUSDC * userLP / totalSupply
  // userEURC = reserveEURC * userLP / totalSupply
  const withdrawableUsdc = hasLiquidity && reserveUsdc
    ? Number(reserveUsdc) * share / 1e6
    : 0
  const withdrawableEurc = hasLiquidity && reserveEurc
    ? Number(reserveEurc) * share / 1e6
    : 0

  // LP balance formatted (18 decimals for LP tokens)
  const lpFormatted = lpBalance ? (Number(lpBalance) / 1e18).toFixed(6) : '0'

  return (
    <div className="space-y-4">
      {/* Position Card */}
      <Card className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              <TokenIcon symbol="USDC" color="#2775CA" size="md" />
              <TokenIcon symbol="EURC" color="#1434CB" size="md" />
            </div>
            <div>
              <h3 className="font-semibold text-coco-dark-text">USDC / EURC</h3>
              <p className="text-xs text-coco-dark-muted">Your Position</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-coco-green-500">{formatPercentage(share * 100)}</p>
            <p className="text-[10px] text-coco-dark-muted">Pool Share</p>
          </div>
        </div>

        {/* Position Details */}
        <div className="mt-4 space-y-3 pt-4 border-t border-coco-dark-border">
          <div className="flex items-center justify-between">
            <span className="text-xs text-coco-dark-muted">LP Tokens</span>
            <span className="text-sm font-mono text-coco-dark-text">{lpFormatted}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-coco-dark-muted">Withdrawable USDC</span>
            <span className="text-sm font-mono text-coco-dark-text">{withdrawableUsdc.toFixed(4)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-coco-dark-muted">Withdrawable EURC</span>
            <span className="text-sm font-mono text-coco-dark-text">{withdrawableEurc.toFixed(4)}</span>
          </div>
        </div>

        {/* Fee Explanation */}
        <div className="mt-4 rounded-lg bg-coco-dark-bg border border-coco-dark-border p-3">
          <p className="text-[11px] text-coco-dark-muted leading-relaxed">
            Fees are included in your withdrawable liquidity. Coco DEX uses a V2-style AMM where 0.3% trading fees stay inside the pool and increase the value of your LP tokens. To collect fees, remove liquidity.
          </p>
        </div>

        {/* Actions */}
        <div className="mt-4 flex gap-2">
          <Link
            to="/pools/add"
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-coco-green-500/10 text-coco-green-500 text-sm font-medium hover:bg-coco-green-500/20 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add More
          </Link>
          <Link
            to="/pools/remove"
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-coco-red-500/10 text-coco-red-500 text-sm font-medium hover:bg-coco-red-500/20 transition-colors"
          >
            <Minus className="h-3.5 w-3.5" />
            <span>Remove</span>
          </Link>
        </div>
      </Card>
    </div>
  )
}
