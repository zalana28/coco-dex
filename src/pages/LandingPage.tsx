import { Link } from 'react-router-dom'
import { ArrowRight, Zap, Droplets, Clock } from 'lucide-react'
import { MOCK_PROTOCOL_STATS } from '@/constants/mock'
import { formatCompact } from '@/utils/format'

export function LandingPage() {
  return (
    <div className="pt-16">
      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Subtle gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-coco-green-500/5 via-transparent to-coco-teal-400/5" />

        <div className="relative mx-auto max-w-5xl px-4 py-24 sm:py-32 text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-coco-dark-text leading-tight">
            Trade stablecoins
            <br />
            <span className="text-coco-green-500">with confidence</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-coco-dark-muted max-w-2xl mx-auto leading-relaxed">
            Deep liquidity, minimal slippage, and instant settlement on Arc Testnet.
            The premium decentralized exchange for stable assets.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              to="/swap"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-coco-green-500 text-white font-medium hover:bg-coco-green-600 active:scale-[0.98] transition-all shadow-lg shadow-coco-green-500/20"
            >
              Start Trading
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/pools"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-coco-dark-border text-coco-dark-text font-medium hover:bg-coco-dark-surface transition-all"
            >
              Explore Pools
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-coco-dark-border/50 bg-coco-dark-surface/50">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
            <StatItem label="Total Value Locked" value={formatCompact(MOCK_PROTOCOL_STATS.tvl)} />
            <StatItem label="24h Volume" value={formatCompact(MOCK_PROTOCOL_STATS.volume24h)} />
            <StatItem label="Total Fees Earned" value={formatCompact(MOCK_PROTOCOL_STATS.totalFees)} />
            <StatItem label="Total Trades" value={MOCK_PROTOCOL_STATS.totalTrades.toLocaleString()} />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-4 py-20">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-coco-dark-text">
            Why Coco DEX?
          </h2>
          <p className="mt-3 text-coco-dark-muted">Built for stablecoin traders who demand the best.</p>
        </div>

        <div className="grid sm:grid-cols-3 gap-6">
          <FeatureCard
            icon={<Zap className="h-6 w-6 text-coco-green-500" />}
            title="Low Fees"
            description="0.3% swap fee with optimized routing for minimal price impact on your trades."
          />
          <FeatureCard
            icon={<Droplets className="h-6 w-6 text-coco-teal-400" />}
            title="Deep Liquidity"
            description="Concentrated liquidity pools designed for stablecoin pairs with tight spreads."
          />
          <FeatureCard
            icon={<Clock className="h-6 w-6 text-coco-amber-500" />}
            title="Instant Settlement"
            description="Powered by Arc Network for near-instant finality and low gas costs."
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-coco-dark-border/50 py-8">
        <div className="mx-auto max-w-5xl px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/coconut.svg" alt="" className="h-5 w-5" />
            <span className="text-sm text-coco-dark-muted">Coco DEX</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-coco-dark-muted">
            <a href="https://testnet.arcscan.app" target="_blank" rel="noopener noreferrer" className="hover:text-coco-dark-text transition-colors">
              Explorer
            </a>
            <span>Built on Arc Testnet</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-xl sm:text-2xl font-bold text-coco-dark-text font-mono">{value}</p>
      <p className="mt-1 text-xs sm:text-sm text-coco-dark-muted">{label}</p>
    </div>
  )
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-2xl bg-coco-dark-surface border border-coco-dark-border p-6 hover:-translate-y-0.5 transition-transform">
      <div className="mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-coco-dark-text">{title}</h3>
      <p className="mt-2 text-sm text-coco-dark-muted leading-relaxed">{description}</p>
    </div>
  )
}
