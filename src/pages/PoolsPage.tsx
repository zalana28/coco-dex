import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/common/Card'
import { TokenIcon } from '@/components/common/TokenIcon'
import { formatCompact, formatPercentage, formatTokenAmount } from '@/utils/format'
import { Plus, Minus, Droplets, AlertTriangle, ExternalLink } from 'lucide-react'
import { useAccount } from 'wagmi'
import { usePairReserves } from '@/hooks/usePairReserves'
import { useLPBalance } from '@/hooks/useLPBalance'
import { useXyloNetStablePool } from '@/hooks/useXyloNetStablePool'

type Tab = 'all' | 'my'

export function PoolsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('all')
  const { address, isConnected } = useAccount()
  const { reserveUsdc, reserveEurc, hasLiquidity, isLoading } = usePairReserves()
  const { balance: lpBalance, share } = useLPBalance(address)

  return (
    <div className="page-fade pt-28 sm:pt-24 pb-12 px-3 sm:px-4 mx-auto max-w-5xl">
      <div className="flex items-center justify-between mb-6 gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-coco-teal-400">Liquidity made visible</p>
          <h1 className="mt-1 text-2xl font-bold text-coco-dark-text">Pools</h1>
        </div>
        <Link
          to="/pools/add"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-coco-green-500 text-white text-sm font-semibold hover:bg-coco-green-600 transition-all shadow-lg shadow-coco-green-500/25 hover:-translate-y-0.5"
        >
          <Plus className="h-4 w-4" />
          New Position
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl bg-coco-dark-surface/70 border border-coco-dark-border w-fit backdrop-blur-xl">
        <TabButton active={activeTab === 'all'} onClick={() => setActiveTab('all')}>All Pools</TabButton>
        <TabButton active={activeTab === 'my'} onClick={() => setActiveTab('my')}>My Positions</TabButton>
      </div>

      {activeTab === 'all' ? (
        <AllPools
          reserveUsdc={reserveUsdc}
          reserveEurc={reserveEurc}
          hasLiquidity={hasLiquidity}
          isLoading={isLoading}
          address={address}
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
          ? 'bg-coco-green-500/15 text-coco-dark-text'
          : 'text-coco-dark-muted hover:text-coco-dark-text'
      }`}
    >
      {children}
    </button>
  )
}

function AllPools({ reserveUsdc, reserveEurc, hasLiquidity, isLoading, address }: {
  reserveUsdc: bigint | undefined; reserveEurc: bigint | undefined; hasLiquidity: boolean; isLoading: boolean; address: `0x${string}` | undefined
}) {
  const externalStablePool = useXyloNetStablePool(address)
  const tvl = hasLiquidity && reserveUsdc && reserveEurc
    ? (Number(reserveUsdc) / 1e6) + (Number(reserveEurc) / 1e6 * 1.086) // EURC ≈ $1.086
    : 0

  return (
    <div className="space-y-4">
      <Card className="p-5 hover:-translate-y-0.5 hover:border-coco-green-500/25">
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

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-coco-dark-border">
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

      <ExternalStablePoolsPanel {...externalStablePool} />
    </div>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-coco-teal-400/25 bg-coco-teal-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-coco-teal-300">
      {children}
    </span>
  )
}

function ExternalStablePoolsPanel({
  pool,
  reserve0,
  reserve1,
  totalSupply,
  userLpBalance,
  isLoading,
  hasReadError,
}: ReturnType<typeof useXyloNetStablePool>) {
  const [token0, token1] = pool.tokens
  const hasReserves = reserve0 !== undefined && reserve1 !== undefined
  const tvl = hasReserves
    ? (Number(reserve0) / 1e6) + (Number(reserve1) / 1e6 * 1.086)
    : 0

  return (
    <section className="pt-2">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-coco-teal-400">External liquidity</p>
          <h2 className="mt-1 text-xl font-semibold text-coco-dark-text">External Stable Pools</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>External</Badge>
          <Badge>Read-only</Badge>
          <Badge>StableSwap</Badge>
        </div>
      </div>

      <Card className="p-5 border-coco-teal-400/20 bg-coco-dark-surface/80">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex -space-x-2">
              <TokenIcon symbol={token0.symbol} color={token0.logoColor} size="md" />
              <TokenIcon symbol={token1.symbol} color={token1.logoColor} size="md" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate font-semibold text-coco-dark-text">{pool.pairLabel}</h3>
              <p className="text-xs text-coco-dark-muted">XyloNet StableSwap - external pool</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 sm:justify-end">
            <a
              href={pool.xylonetUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-coco-dark-border bg-coco-dark-bg/70 px-3 py-1.5 text-xs font-medium text-coco-dark-text transition-colors hover:border-coco-teal-400/40 hover:text-coco-teal-300"
            >
              View on XyloNet
              <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href={pool.arcscanUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-coco-dark-border bg-coco-dark-bg/70 px-3 py-1.5 text-xs font-medium text-coco-dark-text transition-colors hover:border-coco-teal-400/40 hover:text-coco-teal-300"
            >
              Arcscan
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-coco-dark-border pt-4 sm:grid-cols-4">
          <PoolMetric label="Source" value={pool.source} />
          <PoolMetric label="Type" value={pool.type} />
          <PoolMetric label="Fee" value={pool.feeLabel} />
          <PoolMetric label="Status" value={hasReadError ? 'Read issue' : 'External pool'} />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-coco-dark-border bg-coco-dark-bg/55 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <PoolMetric label="TVL" value={isLoading ? '...' : hasReserves ? formatCompact(tvl) : 'Unknown'} mono />
          <PoolMetric
            label={`${token0.symbol} Reserve`}
            value={isLoading ? '...' : reserve0 !== undefined ? formatTokenAmount(reserve0, token0.decimals) : 'Unknown'}
            mono
          />
          <PoolMetric
            label={`${token1.symbol} Reserve`}
            value={isLoading ? '...' : reserve1 !== undefined ? formatTokenAmount(reserve1, token1.decimals) : 'Unknown'}
            mono
          />
          <PoolMetric
            label="LP Supply"
            value={isLoading ? '...' : totalSupply !== undefined ? formatTokenAmount(totalSupply, 18) : 'Unknown'}
            mono
          />
        </div>

        <div className="mt-3 rounded-lg border border-coco-teal-400/15 bg-coco-teal-400/5 p-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-medium text-coco-dark-text">Your XyloNet LP balance</p>
            <p className="font-mono text-xs text-coco-dark-text">
              {isLoading ? '...' : userLpBalance !== undefined ? formatTokenAmount(userLpBalance, 18) : 'Connect wallet to read'}
            </p>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-coco-dark-muted">
            This panel only reads XyloNet pool state. Liquidity management remains outside Coco DEX.
          </p>
        </div>
      </Card>
    </section>
  )
}

function PoolMetric({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-coco-dark-muted">{label}</p>
      <p className={`mt-1 truncate text-sm font-medium text-coco-dark-text ${mono ? 'font-mono' : ''}`}>{value}</p>
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
        <div className="mt-4 rounded-lg bg-coco-dark-bg/75 border border-coco-dark-border p-3">
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
