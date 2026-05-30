import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Code2,
  ExternalLink,
  GitCompareArrows,
  Layers3,
  LineChart,
  LockKeyhole,
  ShieldAlert,
  Sparkles,
  WalletCards,
} from 'lucide-react'
import { MOCK_PROTOCOL_STATS } from '@/constants/mock'
import { formatCompact } from '@/utils/format'

const badges = ['Live on Arc Testnet', 'USDC / EURC', 'Smart Router', 'Real Indexed Analytics']

const stats = [
  { label: 'TVL', value: formatCompact(MOCK_PROTOCOL_STATS.tvl) },
  { label: '24h Volume', value: formatCompact(MOCK_PROTOCOL_STATS.volume24h) },
  { label: 'Total Trades', value: MOCK_PROTOCOL_STATS.totalTrades.toLocaleString() },
  { label: 'Indexed Blocks', value: 'Syncing' },
]

const faqs = [
  {
    question: 'What is Coco DEX?',
    answer: 'Coco DEX is a testnet-native stablecoin routing interface for Arc that compares Coco pools with external Arc liquidity.',
  },
  {
    question: 'Why can Coco price differ from XyloNet?',
    answer: 'Each route uses its own pool reserves, fee model, and liquidity depth, so quotes can differ even for the same USDC/EURC pair.',
  },
  {
    question: 'What is smart routing?',
    answer: 'Smart routing compares available routes before you swap, then shows expected output, min received, route source, and slippage.',
  },
  {
    question: 'Why do external routes need separate approvals?',
    answer: 'Token allowances are granted per spender. External routes may require separate approvals for their own router contracts.',
  },
  {
    question: 'Is this mainnet?',
    answer: 'No. Coco DEX is currently built for Arc Testnet and should be treated as testnet software.',
  },
  {
    question: 'Where can I see transactions?',
    answer: 'Swap and liquidity transactions link to Arcscan, and indexed protocol activity is visible on the analytics page.',
  },
]

export function LandingPage() {
  return (
    <div className="page-fade pt-16">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.2),transparent_32%),radial-gradient(circle_at_78%_16%,rgba(34,211,238,0.16),transparent_28%),linear-gradient(180deg,rgba(2,6,23,0)_0%,rgba(2,6,23,0.8)_92%)]" />
        <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_0.86fr] lg:px-8 lg:py-20">
          <div className="max-w-3xl">
            <div className="mb-6 flex flex-wrap gap-2">
              {badges.map((badge) => (
                <span
                  key={badge}
                  className="rounded-full border border-coco-dark-border bg-coco-dark-surface/60 px-3 py-1 text-xs font-medium text-coco-dark-secondary shadow-coco-1 backdrop-blur-xl"
                >
                  {badge}
                </span>
              ))}
            </div>
            <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-coco-dark-text sm:text-6xl lg:text-7xl">
              Smart routing for Arc stablecoins.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-coco-dark-secondary sm:text-lg">
              Coco DEX compares routes across Coco pools and external Arc liquidity so you can swap USDC and EURC with clearer pricing, real analytics, and testnet-native execution.
            </p>
            <div className="mt-8 grid gap-3 sm:flex">
              <Link
                to="/swap"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-coco-green-500 px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-coco-green-500/25 transition-all hover:-translate-y-0.5 hover:bg-coco-green-600"
              >
                Launch App
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/analytics"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-coco-dark-border bg-coco-dark-surface/70 px-6 py-3.5 text-sm font-semibold text-coco-dark-text shadow-coco-1 backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-coco-teal-400/40"
              >
                View Analytics
                <BarChart3 className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-3 text-sm text-coco-dark-muted">
              <Link to="/pools" className="inline-flex items-center gap-1.5 hover:text-coco-teal-400">
                Explore Pools <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <a href="https://github.com/zalana28/coco-dex" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-coco-teal-400">
                GitHub <Code2 className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>

          <HeroSwapMockup />
        </div>
      </section>

      <section className="border-y border-coco-dark-border/70 bg-coco-dark-surface/35 backdrop-blur-xl">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px px-4 py-4 sm:px-6 lg:grid-cols-4 lg:px-8">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-coco-dark-border bg-coco-dark-bg/40 p-5">
              <p className="font-mono text-2xl font-semibold text-coco-dark-text">{stat.value}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-coco-dark-muted">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <Section
          eyebrow="Compare routes before you swap"
          title="Smart routing that keeps route quality visible."
          description="Coco compares available Arc routes, executes Coco pool swaps directly, and can route through XyloNet when selected. UnitFlow and Synthra integrations are prepared as coming soon routes."
        >
          <FeatureGrid>
            <FeatureCard icon={<GitCompareArrows />} title="Route comparison" description="See expected output, min received, route source, execution status, and slippage before taking action." />
            <FeatureCard icon={<Sparkles />} title="External liquidity" description="XyloNet routes can execute through the XyloNet router while future integrations stay clearly marked." />
            <FeatureCard icon={<LockKeyhole />} title="Approval clarity" description="External routes may require separate approvals, so route-specific approval context stays visible." />
          </FeatureGrid>
        </Section>

        <Section
          eyebrow="Liquidity made visible"
          title="Add, track, and remove Coco liquidity."
          description="Provide liquidity to Coco pools, monitor LP position value, and remove liquidity anytime. Fees are reflected through pool value like V2-style AMM pools."
        >
          <FeatureGrid>
            <FeatureCard icon={<Layers3 />} title="Stablecoin pools" description="USDC/EURC liquidity is presented with reserves, pool status, and position details." />
            <FeatureCard icon={<WalletCards />} title="LP positions" description="Connected wallets can see LP balances, pool share, and estimated withdrawable assets." />
            <FeatureCard icon={<CheckCircle2 />} title="Testnet workflow" description="Arc Testnet network guard and wallet states remain visible throughout app pages." />
          </FeatureGrid>
        </Section>

        <Section
          eyebrow="Real indexed analytics"
          title="Protocol activity with indexed event context."
          description="Analytics surfaces real indexed swap and liquidity activity, TVL and volume charts, Supabase-backed event data, and Arcscan transaction links."
        >
          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-2xl border border-coco-dark-border bg-coco-dark-surface/70 p-6 shadow-coco-2 backdrop-blur-xl">
              <LineChart className="h-8 w-8 text-coco-teal-400" />
              <h3 className="mt-5 text-xl font-semibold text-coco-dark-text">Indexer-aware dashboards</h3>
              <p className="mt-3 text-sm leading-6 text-coco-dark-muted">
                Track TVL, 24h volume, total trades, recent events, and sync health from the analytics page.
              </p>
              <Link to="/analytics" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-coco-teal-400 hover:text-coco-teal-600">
                View Analytics <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {['TVL and volume charts', 'Supabase-backed event indexer', 'Arcscan transaction links', 'Swap and liquidity activity'].map((item) => (
                <div key={item} className="rounded-2xl border border-coco-dark-border bg-coco-dark-bg/55 p-5 text-sm font-medium text-coco-dark-secondary">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </Section>

        <section className="rounded-3xl border border-coco-amber-500/20 bg-coco-amber-500/10 p-6 shadow-coco-1 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-coco-amber-500/25 bg-coco-amber-500/10 px-3 py-1 text-xs font-medium text-coco-amber-500">
                <ShieldAlert className="h-3.5 w-3.5" />
                Built for Arc Testnet
              </div>
              <h2 className="text-2xl font-semibold text-coco-dark-text sm:text-3xl">Testnet-native stablecoin routing.</h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-coco-dark-secondary">
                Coco DEX is currently on Arc Testnet. Always verify route, min received, and router approval before signing. External route approvals are separate per router. This is not mainnet.
              </p>
            </div>
            <a
              href="https://testnet.arcscan.app"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-coco-dark-border bg-coco-dark-surface/70 px-5 py-3 text-sm font-semibold text-coco-dark-text transition-colors hover:border-coco-amber-500/40"
            >
              Arcscan
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </section>

        <section className="mt-20">
          <div className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-coco-teal-400">FAQ</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-coco-dark-text sm:text-4xl">Stablecoin routing questions.</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {faqs.map((faq) => (
              <div key={faq.question} className="rounded-2xl border border-coco-dark-border bg-coco-dark-surface/70 p-6 shadow-coco-1 backdrop-blur-xl">
                <h3 className="text-base font-semibold text-coco-dark-text">{faq.question}</h3>
                <p className="mt-3 text-sm leading-6 text-coco-dark-muted">{faq.answer}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-coco-dark-border/70 py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 text-sm text-coco-dark-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>Coco DEX · Built for Arc Testnet</span>
          <div className="flex flex-wrap gap-5">
            <Link to="/swap" className="hover:text-coco-teal-400">Launch App</Link>
            <Link to="/pools" className="hover:text-coco-teal-400">Explore Pools</Link>
            <Link to="/analytics" className="hover:text-coco-teal-400">View Analytics</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

function HeroSwapMockup() {
  return (
    <div className="relative mx-auto w-full max-w-[27rem]">
      <div className="absolute inset-0 rounded-[2rem] bg-coco-green-500/20 blur-3xl" />
      <div className="relative rounded-[2rem] border border-coco-dark-border bg-coco-dark-surface/75 p-4 shadow-[0_24px_90px_rgba(2,6,23,0.55)] backdrop-blur-2xl sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-coco-dark-muted">Best route</p>
            <h2 className="mt-1 text-lg font-semibold text-coco-dark-text">Swap preview</h2>
          </div>
          <span className="rounded-full bg-coco-teal-400/12 px-3 py-1 text-xs font-medium text-coco-teal-400">Arc Testnet</span>
        </div>

        <div className="space-y-3">
          <MockAmount label="Sell" amount="1" token="USDC" />
          <div className="mx-auto grid h-9 w-9 place-items-center rounded-xl border border-coco-dark-border bg-coco-dark-bg text-coco-teal-400">
            <ArrowRight className="h-4 w-4 rotate-90" />
          </div>
          <MockAmount label="Receive" amount="Best route quote" token="EURC" />
        </div>

        <div className="mt-5 space-y-2">
          <MockRoute name="Coco" detail="Direct pool" output="0.9389 EURC" selected />
          <MockRoute name="XyloNet" detail="External router" output="0.9391 EURC" />
          <MockRoute name="UnitFlow" detail="Coming soon" output="Pending" muted />
          <MockRoute name="Synthra" detail="Coming soon" output="Pending" muted />
        </div>
      </div>
    </div>
  )
}

function MockAmount({ label, amount, token }: { label: string; amount: string; token: string }) {
  return (
    <div className="rounded-2xl border border-coco-dark-border bg-coco-dark-bg/80 p-4">
      <div className="mb-2 flex items-center justify-between text-xs text-coco-dark-muted">
        <span>{label}</span>
        <span>Balance visible in app</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate font-mono text-2xl text-coco-dark-text">{amount}</span>
        <span className="rounded-xl border border-coco-dark-border bg-coco-dark-surface px-3 py-2 text-sm font-semibold text-coco-dark-text">{token}</span>
      </div>
    </div>
  )
}

function MockRoute({ name, detail, output, selected = false, muted = false }: { name: string; detail: string; output: string; selected?: boolean; muted?: boolean }) {
  return (
    <div className={`rounded-2xl border p-3 transition-all ${
      selected
        ? 'border-coco-green-500/55 bg-coco-green-500/12 shadow-lg shadow-coco-green-500/10'
        : muted
          ? 'border-dashed border-coco-dark-border bg-coco-dark-bg/35'
          : 'border-coco-dark-border bg-coco-dark-bg/55'
    }`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className={`text-sm font-semibold ${muted ? 'text-coco-dark-muted' : 'text-coco-dark-text'}`}>{name}</p>
          <p className="text-xs text-coco-dark-muted">{detail}</p>
        </div>
        <p className={`text-right font-mono text-xs ${muted ? 'text-coco-dark-muted' : 'text-coco-teal-400'}`}>{output}</p>
      </div>
    </div>
  )
}

function Section({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return (
    <section className="mb-20">
      <div className="mb-8 max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-coco-teal-400">{eyebrow}</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-coco-dark-text sm:text-4xl">{title}</h2>
        <p className="mt-4 text-sm leading-7 text-coco-dark-secondary sm:text-base">{description}</p>
      </div>
      {children}
    </section>
  )
}

function FeatureGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-3">{children}</div>
}

function FeatureCard({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="group rounded-2xl border border-coco-dark-border bg-coco-dark-surface/70 p-6 shadow-coco-1 backdrop-blur-xl transition-all hover:-translate-y-1 hover:border-coco-green-500/35 hover:shadow-coco-2">
      <div className="mb-5 grid h-11 w-11 place-items-center rounded-2xl border border-coco-green-500/25 bg-coco-green-500/10 text-coco-teal-400 transition-colors group-hover:text-coco-dark-text">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-coco-dark-text">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-coco-dark-muted">{description}</p>
    </div>
  )
}
