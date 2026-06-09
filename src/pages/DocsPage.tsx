import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock,
  Code2,
  ExternalLink,
  FileText,
  GitCompareArrows,
  Info,
  KeyRound,
  Layers3,
  LifeBuoy,
  LockKeyhole,
  Network,
  ShieldAlert,
  Smartphone,
  Terminal,
  WalletCards,
  Wifi,
} from 'lucide-react'

const sectionLinks = [
  { id: 'overview', label: 'Overview' },
  { id: 'network', label: 'Network' },
  { id: 'tokens', label: 'Tokens' },
  { id: 'router', label: 'Smart Router' },
  { id: 'pricing', label: 'Prices' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'swap-flow', label: 'Swap Flow' },
  { id: 'liquidity', label: 'Liquidity' },
  { id: 'stable-pool', label: 'Stable Pool' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'walletconnect', label: 'Mobile' },
  { id: 'troubleshooting', label: 'Troubleshooting' },
  { id: 'security', label: 'Security' },
  { id: 'circle', label: 'Circle Future' },
  { id: 'developer', label: 'Developers' },
]

const overviewCards = [
  {
    title: 'Smart-routing interface',
    description: 'Coco DEX is a smart-routing DEX interface for Arc Testnet stablecoin swaps.',
  },
  {
    title: 'Route comparison',
    description: 'The swap page compares route quotes across Coco, XyloNet, UnitFlow, and Synthra before execution.',
  },
  {
    title: 'User choice',
    description: 'Users can review available quotes, select the route they want, then approve and swap from the selected route.',
  },
  {
    title: 'Testnet only',
    description: 'Coco DEX currently targets Arc Testnet only.',
  },
]

const tokenCards = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    detail: 'Primary stablecoin input/output in the Coco UI. Arc also uses USDC as the native gas token, while ERC-20 USDC swap amounts use token precision shown by the app.',
  },
  {
    symbol: 'EURC',
    name: 'Euro Coin',
    detail: 'Supported stablecoin pair asset for Coco pools and external route comparisons.',
  },
  {
    symbol: 'WUSDC',
    name: 'Wrapped USDC',
    detail: 'Shown where relevant in the UnitFlow route path, such as USDC -> WUSDC -> EURC. It is not exposed as a general token selector in the current UI.',
  },
]

const routeCards = [
  {
    name: 'Coco',
    kind: 'Direct pool route',
    badge: 'Coco liquidity',
    points: [
      'Uses Coco pool liquidity for the selected stablecoin pair.',
      'Displayed as the direct Coco route in quote comparison.',
      'Approval, if needed, is for the Coco router spender.',
    ],
  },
  {
    name: 'XyloNet',
    kind: 'External router route',
    badge: 'External liquidity',
    points: [
      'Quotes and executes through the XyloNet external router when available.',
      'Requires token approval to the XyloNet router before that router can spend the selected token.',
      'XyloNet approval is separate from Coco and other external routers.',
    ],
  },
  {
    name: 'UnitFlow',
    kind: 'Universal router route',
    badge: 'USDC -> WUSDC -> EURC',
    points: [
      'Uses the UnitFlow route shown by the current UI, including WUSDC where that path is displayed.',
      'The executable Arc Testnet direction is handled through UnitFlow universal-router execution after route selection.',
      'Treat UnitFlow as route-specific: follow the approval or wallet permission prompt shown by the app if this route is selected.',
    ],
  },
  {
    name: 'Synthra',
    kind: 'V3 route',
    badge: 'Fee-tier quote',
    points: [
      'Compares Synthra V3 fee-tier quotes for supported pairs.',
      'Executes through the Synthra route after the required token approval.',
      'Synthra approval is separate from Coco, XyloNet, and UnitFlow route permissions.',
    ],
  },
]

const pricingPoints = [
  'Each router or pool has different liquidity and reserve depth.',
  'Quotes can differ because of reserves, fee tier, route path, slippage settings, and market movement between quote and execution.',
  'The "Best" badge is based on current quote comparison in the app, not a guarantee of future execution price.',
  'Always check expected output and minimum received before approving or swapping.',
]

const approvalPoints = [
  'Each external router may require a separate token approval.',
  'An approval gives one router permission to spend a specific token from the connected wallet.',
  'Coco, XyloNet, UnitFlow, and Synthra can use different spender permissions or wallet prompts.',
  'Approval is normal DeFi behavior, but users should only approve spenders and amounts they understand.',
]

const swapSteps = [
  'Connect wallet',
  'Switch to Arc Testnet',
  'Choose token pair',
  'Enter amount',
  'Compare routes',
  'Select route',
  'Approve token if needed',
  'Swap',
  'Check transaction link',
]

const troubleshootingItems = [
  {
    title: 'Wallet provider not found',
    detail: 'Install or unlock a browser wallet, use a wallet browser, or connect through WalletConnect if available.',
  },
  {
    title: 'WalletConnect project ID missing',
    detail: 'The deployment needs VITE_WALLETCONNECT_PROJECT_ID configured for WalletConnect options to appear.',
  },
  {
    title: 'Wrong network',
    detail: 'Use the app network prompt to switch the connected wallet to Arc Testnet before signing transactions.',
  },
  {
    title: 'Insufficient balance',
    detail: 'Confirm the wallet has enough input token and enough native gas token for the transaction.',
  },
  {
    title: 'Approval required',
    detail: 'Approve the selected token for the selected route spender, then wait for the approval transaction to confirm.',
  },
  {
    title: 'Router reverted',
    detail: 'The route may have moved, liquidity may be insufficient, or the minimum received threshold may no longer be reachable.',
  },
  {
    title: 'Simulation failed',
    detail: 'Simulation can fail when allowance, balance, route state, or quote freshness is invalid. Refresh the quote and review the selected route.',
  },
  {
    title: 'Deadline expired',
    detail: 'Submit a fresh transaction. A deadline protects users from execution after the allowed time window.',
  },
  {
    title: 'Transaction pending',
    detail: 'Wait for wallet and network confirmation, then open the transaction link in Arcscan if a hash is available.',
  },
  {
    title: 'Analytics not updated yet',
    detail: 'Analytics depends on the indexer and can lag the latest block or cron run.',
  },
]

const circleItems = [
  {
    title: 'Circle API Keys',
    detail: 'Future backend-only readiness checks could use Circle API keys on the server. API keys must never be exposed in frontend code or committed to the repository.',
    href: 'https://developers.circle.com/api-reference/keys',
  },
  {
    title: 'CCTP',
    detail: 'Future bridge UX could use CCTP to move native USDC to Arc before swapping. CCTP uses a native USDC burn-and-mint transfer model. This is not implemented in Coco DEX today.',
    href: 'https://developers.circle.com/cctp',
  },
  {
    title: 'Circle Wallets',
    detail: 'Future embedded wallet onboarding could help non-wallet users later. The current app still relies on connected wallets and does not implement Circle Wallets.',
    href: 'https://developers.circle.com/wallets',
  },
  {
    title: 'Gas Station',
    detail: 'Future gasless UX would require Circle Wallets and EVM smart-contract-account style setup. MetaMask and Rabby users are not automatically gasless.',
    href: 'https://developers.circle.com/wallets/gas-station',
  },
  {
    title: 'Smart Contracts',
    detail: 'Future admin or developer tooling could use Circle Contracts for contract read/write workflows or event monitoring. Coco DEX does not add Circle contract APIs in this PR.',
    href: 'https://developers.circle.com/contracts',
  },
]

const developerCommands = [
  'git clone <repo-url>',
  'cd coco-dex',
  'npm install',
  'cp .env.example .env.local',
  'npm run dev',
  'npm run build',
  'npm test',
  'npm run typecheck',
  'npm run lint',
]

const envVars = [
  'ARC_TESTNET_RPC_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CRON_SECRET',
  'VITE_WALLETCONNECT_PROJECT_ID',
]

export function DocsPage() {
  return (
    <div className="page-fade px-4 pb-20 pt-28 sm:px-6 sm:pt-24 lg:px-8">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_16%_8rem,rgba(59,130,246,0.22),transparent_30rem),radial-gradient(circle_at_88%_22rem,rgba(34,211,238,0.14),transparent_26rem),linear-gradient(180deg,rgba(2,6,23,0),rgba(2,6,23,0.86))]" />

      <div className="relative mx-auto max-w-7xl">
        <section className="overflow-hidden rounded-[2rem] border border-coco-dark-border bg-coco-dark-surface/55 shadow-coco-3 backdrop-blur-2xl">
          <div className="relative px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
            <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-coco-green-500/15 blur-3xl" />
            <div className="absolute bottom-0 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full bg-coco-teal-400/10 blur-3xl" />
            <div className="relative max-w-4xl">
              <div className="mb-5 flex flex-wrap gap-2">
                <Pill icon={<BookOpen className="h-3.5 w-3.5" />}>User-facing docs</Pill>
                <Pill icon={<Code2 className="h-3.5 w-3.5" />}>Developer notes</Pill>
                <Pill icon={<Network className="h-3.5 w-3.5" />}>Arc Testnet</Pill>
              </div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-coco-teal-400">Coco DEX Docs</p>
              <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight text-coco-dark-text sm:text-6xl lg:text-7xl">
                Route-aware stablecoin swaps on Arc Testnet.
              </h1>
              <p className="mt-6 max-w-3xl text-base leading-8 text-coco-dark-secondary sm:text-lg">
                Learn how Coco DEX compares Coco, XyloNet, UnitFlow, and Synthra routes, what approvals mean, how analytics update, and what future Circle integrations could look like without exposing secrets or claiming unfinished features.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/swap"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-coco-green-500 px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-coco-green-500/25 transition-all hover:-translate-y-0.5 hover:bg-coco-green-600"
                >
                  Open Swap
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#developer"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-coco-dark-border bg-coco-dark-bg/70 px-6 py-3.5 text-sm font-semibold text-coco-dark-text shadow-coco-1 transition-all hover:-translate-y-0.5 hover:border-coco-teal-400/40"
                >
                  Developer Setup
                  <Terminal className="h-4 w-4" />
                </a>
              </div>
            </div>
          </div>
        </section>

        <div className="sticky top-16 z-20 -mx-4 mt-6 border-y border-coco-dark-border bg-coco-dark-bg/88 px-4 py-3 backdrop-blur-2xl sm:-mx-6 sm:px-6 lg:hidden">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {sectionLinks.map((link) => (
              <a
                key={link.id}
                href={`#${link.id}`}
                className="shrink-0 rounded-full border border-coco-dark-border bg-coco-dark-surface/70 px-3 py-2 text-xs font-medium text-coco-dark-muted transition-colors hover:border-coco-green-500/35 hover:text-coco-dark-text"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
          <aside className="hidden lg:sticky lg:top-24 lg:block">
            <nav className="rounded-3xl border border-coco-dark-border bg-coco-dark-surface/55 p-3 shadow-coco-1 backdrop-blur-2xl">
              <p className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-coco-dark-muted">On this page</p>
              <div className="mt-1 grid gap-1">
                {sectionLinks.map((link) => (
                  <a
                    key={link.id}
                    href={`#${link.id}`}
                    className="rounded-2xl px-3 py-2 text-sm font-medium text-coco-dark-muted transition-colors hover:bg-coco-green-500/10 hover:text-coco-dark-text"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </nav>
          </aside>

          <main className="min-w-0 space-y-8">
            <DocSection id="overview" eyebrow="Overview" title="What Coco DEX does" icon={<GitCompareArrows />}>
              <div className="grid gap-4 md:grid-cols-2">
                {overviewCards.map((card) => (
                  <GlassCard key={card.title}>
                    <h3 className="text-base font-semibold text-coco-dark-text">{card.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-coco-dark-muted">{card.description}</p>
                  </GlassCard>
                ))}
              </div>
            </DocSection>

            <DocSection id="network" eyebrow="Supported Network" title="Arc Testnet only" icon={<Wifi />}>
              <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
                <GlassCard className="border-coco-green-500/20 bg-coco-green-500/10">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-coco-teal-400">Current network</p>
                  <h3 className="mt-3 text-2xl font-semibold text-coco-dark-text">Arc Testnet</h3>
                  <p className="mt-3 text-sm leading-6 text-coco-dark-muted">
                    Connect a wallet and switch to Arc Testnet before using swap, approval, or liquidity actions.
                  </p>
                </GlassCard>
                <GlassCard>
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="mt-1 h-5 w-5 shrink-0 text-coco-amber-500" />
                    <div>
                      <h3 className="text-base font-semibold text-coco-dark-text">Careful testnet language</h3>
                      <p className="mt-3 text-sm leading-6 text-coco-dark-muted">
                        Coco DEX is currently built for Arc Testnet. Treat balances, routing behavior, and integrations as testnet behavior unless a future release explicitly says otherwise.
                      </p>
                    </div>
                  </div>
                </GlassCard>
              </div>
            </DocSection>

            <DocSection id="tokens" eyebrow="Supported Tokens" title="Stablecoins shown by the app" icon={<Layers3 />}>
              <div className="grid gap-4 md:grid-cols-3">
                {tokenCards.map((token) => (
                  <GlassCard key={token.symbol}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-mono text-2xl font-semibold text-coco-dark-text">{token.symbol}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-coco-dark-muted">{token.name}</p>
                      </div>
                      <span className="grid h-11 w-11 place-items-center rounded-full bg-coco-green-500/15 text-sm font-bold text-coco-teal-400">
                        {token.symbol.charAt(0)}
                      </span>
                    </div>
                    <p className="mt-5 text-sm leading-6 text-coco-dark-muted">{token.detail}</p>
                  </GlassCard>
                ))}
              </div>
            </DocSection>

            <DocSection id="router" eyebrow="Smart Router" title="Route types and approval context" icon={<Network />}>
              <div className="grid gap-4 md:grid-cols-2">
                {routeCards.map((route) => (
                  <GlassCard key={route.name} className="relative overflow-hidden">
                    <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-coco-green-500/10 blur-2xl" />
                    <div className="relative">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-xl font-semibold text-coco-dark-text">{route.name}</h3>
                        <span className="rounded-full bg-coco-dark-border/55 px-2.5 py-1 text-[11px] font-medium text-coco-dark-muted">{route.kind}</span>
                        <span className="rounded-full bg-coco-teal-400/10 px-2.5 py-1 text-[11px] font-medium text-coco-teal-400">{route.badge}</span>
                      </div>
                      <ul className="mt-5 space-y-3">
                        {route.points.map((point) => (
                          <li key={point} className="flex gap-2.5 text-sm leading-6 text-coco-dark-muted">
                            <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-coco-green-500" />
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </GlassCard>
                ))}
              </div>
            </DocSection>

            <DocSection id="pricing" eyebrow="Why Prices Differ" title="A quote is a snapshot, not a promise" icon={<Info />}>
              <PointGrid points={pricingPoints} />
            </DocSection>

            <DocSection id="approvals" eyebrow="Approvals" title="Spenders are route-specific" icon={<KeyRound />}>
              <div className="grid gap-4 lg:grid-cols-[1fr_0.85fr]">
                <PointGrid points={approvalPoints} />
                <GlassCard className="border-coco-amber-500/20 bg-coco-amber-500/10">
                  <LockKeyhole className="h-8 w-8 text-coco-amber-500" />
                  <h3 className="mt-5 text-lg font-semibold text-coco-dark-text">Approval rule of thumb</h3>
                  <p className="mt-3 text-sm leading-6 text-coco-dark-muted">
                    Review the selected route, token, spender, and amount before approving. A router cannot spend a token unless the wallet grants allowance or signs the required route permission.
                  </p>
                </GlassCard>
              </div>
            </DocSection>

            <DocSection id="swap-flow" eyebrow="Swap Flow" title="From wallet connection to transaction link" icon={<CheckCircle2 />}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {swapSteps.map((step, index) => (
                  <div key={step} className="rounded-2xl border border-coco-dark-border bg-coco-dark-surface/65 p-4 shadow-coco-1 backdrop-blur-xl">
                    <span className="font-mono text-xs text-coco-teal-400">Step {index + 1}</span>
                    <p className="mt-2 text-sm font-semibold text-coco-dark-text">{step}</p>
                  </div>
                ))}
              </div>
            </DocSection>

            <DocSection id="liquidity" eyebrow="Liquidity" title="Providing Coco pool liquidity" icon={<Layers3 />}>
              <div className="grid gap-4 md:grid-cols-3">
                <Feature title="Add and remove" detail="Users can add or remove liquidity in Coco pools through the app." />
                <Feature title="LP visibility" detail="Connected wallets can view LP positions and pool share in the app." />
                <Feature title="Pool risk" detail="Liquidity providers take pool risk and price imbalance risk. Coco DEX should not be read as promising yield." />
              </div>
            </DocSection>

            <DocSection id="stable-pool" eyebrow="LP Beta" title="Coco Native Stable Pool" icon={<ShieldAlert />}>
              <div className="grid gap-4 md:grid-cols-2">
                <GlassCard className="border-coco-amber-500/20 bg-coco-amber-500/10">
                  <h3 className="text-lg font-semibold text-coco-dark-text">Arc Testnet LP Beta</h3>
                  <p className="mt-3 text-sm leading-6 text-coco-dark-muted">
                    Coco Native Stable Pool V1 supports tiny test add/remove liquidity flows on the Pools page. It is unaudited, not routed, and indexed only through separate beta observability.
                  </p>
                </GlassCard>
                <GlassCard>
                  <h3 className="text-lg font-semibold text-coco-dark-text">Readiness docs</h3>
                  <p className="mt-3 text-sm leading-6 text-coco-dark-muted">
                    See `docs/stable-pool-readiness.md`, `docs/stable-pool-v2-plan.md`, and `docs/release-checklist.md` in the repository for release notes and beta exit criteria.
                  </p>
                </GlassCard>
              </div>
            </DocSection>

            <DocSection id="analytics" eyebrow="Analytics" title="Indexed protocol activity" icon={<BarChart3 />}>
              <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                <GlassCard>
                  <h3 className="text-lg font-semibold text-coco-dark-text">What analytics can show</h3>
                  <p className="mt-3 text-sm leading-6 text-coco-dark-muted">
                    Coco DEX has indexed analytics for the classic Coco V2 pair, including TVL, volume, trades, and activity where available in the current app. Coco Native Stable Pool V1 is not indexed yet.
                  </p>
                </GlassCard>
                <GlassCard>
                  <Clock className="h-7 w-7 text-coco-teal-400" />
                  <h3 className="mt-4 text-lg font-semibold text-coco-dark-text">Indexer timing</h3>
                  <p className="mt-3 text-sm leading-6 text-coco-dark-muted">
                    Analytics may lag behind the latest transaction depending on block indexing, cron timing, and serverless/API refresh behavior.
                  </p>
                </GlassCard>
              </div>
            </DocSection>

            <DocSection id="walletconnect" eyebrow="WalletConnect and Mobile" title="Wallet behavior by device" icon={<Smartphone />}>
              <div className="grid gap-4 md:grid-cols-3">
                <Feature title="Desktop extensions" detail="Desktop injected wallets work through browser extensions that expose wallet providers to the page." />
                <Feature title="Mobile browsers" detail="Normal mobile browsers may need WalletConnect. Wallet browsers can provide injected providers directly." />
                <Feature title="Deployment check" detail="If WalletConnect fails to appear, check VITE_WALLETCONNECT_PROJECT_ID in the deployment environment." />
              </div>
            </DocSection>

            <DocSection id="troubleshooting" eyebrow="Troubleshooting" title="Common user-facing failures" icon={<LifeBuoy />}>
              <div className="grid gap-4 md:grid-cols-2">
                {troubleshootingItems.map((item) => (
                  <GlassCard key={item.title}>
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-coco-amber-500" />
                      <div>
                        <h3 className="text-base font-semibold text-coco-dark-text">{item.title}</h3>
                        <p className="mt-2 text-sm leading-6 text-coco-dark-muted">{item.detail}</p>
                      </div>
                    </div>
                  </GlassCard>
                ))}
              </div>
            </DocSection>

            <DocSection id="security" eyebrow="Security Notes" title="Testnet, approvals, and secrets" icon={<ShieldAlert />}>
              <div className="grid gap-4 md:grid-cols-2">
                <Feature title="Testnet status" detail="Coco DEX is Arc Testnet software. Use Arc Testnet tokens and Arc Testnet transaction links only." />
                <Feature title="Verify before signing" detail="Always verify the selected route and minimum received before approving or swapping." />
                <Feature title="External approvals" detail="External routes require separate approvals or route-specific wallet permissions." />
                <Feature title="Key hygiene" detail="Never share seed phrases or private keys. API keys and secrets must never be committed." />
              </div>
            </DocSection>

            <DocSection id="circle" eyebrow="Future Integrations" title="Circle ideas are not implemented" icon={<WalletCards />}>
              <div className="mb-5 rounded-2xl border border-coco-amber-500/20 bg-coco-amber-500/10 p-4 text-sm leading-6 text-coco-dark-secondary">
                This section documents future integration ideas only. This PR does not add Circle API calls, frontend secrets, CCTP transactions, embedded wallets, gas sponsorship, or smart-contract API integration.
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {circleItems.map((item) => (
                  <GlassCard key={item.title}>
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-base font-semibold text-coco-dark-text">{item.title}</h3>
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-coco-dark-border p-2 text-coco-dark-muted transition-colors hover:border-coco-teal-400/40 hover:text-coco-teal-400"
                        aria-label={`${item.title} Circle documentation`}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-coco-dark-muted">{item.detail}</p>
                  </GlassCard>
                ))}
              </div>
            </DocSection>

            <DocSection id="developer" eyebrow="Developer Setup" title="Run Coco DEX locally" icon={<Terminal />}>
              <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
                <GlassCard>
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-coco-teal-400" />
                    <h3 className="text-lg font-semibold text-coco-dark-text">Commands</h3>
                  </div>
                  <pre className="mt-5 overflow-x-auto rounded-2xl border border-coco-dark-border bg-coco-dark-bg/90 p-4 text-xs leading-6 text-coco-dark-secondary"><code>{developerCommands.join('\n')}</code></pre>
                </GlassCard>
                <GlassCard>
                  <h3 className="text-lg font-semibold text-coco-dark-text">Environment variables</h3>
                  <p className="mt-3 text-sm leading-6 text-coco-dark-muted">
                    Create local values without committing real secrets. Server-only secrets must not use a VITE_ prefix.
                  </p>
                  <div className="mt-5 grid gap-2">
                    {envVars.map((envVar) => (
                      <code key={envVar} className="rounded-xl border border-coco-dark-border bg-coco-dark-bg/80 px-3 py-2 text-xs text-coco-dark-secondary">
                        {envVar}=...
                      </code>
                    ))}
                  </div>
                </GlassCard>
              </div>
            </DocSection>
          </main>
        </div>
      </div>
    </div>
  )
}

function DocSection({ id, eyebrow, title, icon, children }: { id: string; eyebrow: string; title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 rounded-[1.75rem] border border-coco-dark-border bg-coco-dark-bg/38 p-4 shadow-coco-1 backdrop-blur-xl sm:p-6 lg:p-7">
      <div className="mb-6 flex items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-coco-green-500/25 bg-coco-green-500/10 text-coco-teal-400 shadow-lg shadow-coco-green-500/10">
          {icon}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-coco-teal-400">{eyebrow}</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-coco-dark-text sm:text-3xl">{title}</h2>
        </div>
      </div>
      {children}
    </section>
  )
}

function GlassCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-coco-dark-border bg-coco-dark-surface/70 p-5 shadow-coco-1 backdrop-blur-xl ${className}`}>
      {children}
    </div>
  )
}

function Pill({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-coco-dark-border bg-coco-dark-bg/55 px-3 py-1.5 text-xs font-medium text-coco-dark-secondary shadow-coco-1 backdrop-blur-xl">
      {icon}
      {children}
    </span>
  )
}

function PointGrid({ points }: { points: string[] }) {
  return (
    <div className="grid gap-3">
      {points.map((point) => (
        <div key={point} className="flex gap-3 rounded-2xl border border-coco-dark-border bg-coco-dark-surface/65 p-4 shadow-coco-1 backdrop-blur-xl">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-coco-green-500" />
          <p className="text-sm leading-6 text-coco-dark-muted">{point}</p>
        </div>
      ))}
    </div>
  )
}

function Feature({ title, detail }: { title: string; detail: string }) {
  return (
    <GlassCard>
      <h3 className="text-base font-semibold text-coco-dark-text">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-coco-dark-muted">{detail}</p>
    </GlassCard>
  )
}
