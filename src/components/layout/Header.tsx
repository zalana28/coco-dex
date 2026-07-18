import { useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { ConnectWalletButton } from '@/components/common/ConnectWalletButton'

const appNavLinks = [
  { to: '/swap', label: 'Swap' },
  { to: '/bridge', label: 'Bridge' },
  { to: '/pools', label: 'Pools' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/docs', label: 'Docs' },
]

const shell =
  'fixed left-0 right-0 top-0 z-50 border-b border-coco-dark-border/70 bg-coco-dark-bg/75 shadow-[0_12px_40px_rgba(2,6,23,0.28)] backdrop-blur-2xl'

const bar =
  'mx-auto flex h-16 min-w-0 items-center justify-between gap-2 px-2.5 sm:gap-3 sm:px-6 lg:px-8 max-w-7xl'

const logoLink = 'group flex min-w-0 shrink-0 items-center gap-2'

const logoMark =
  'relative grid h-9 w-9 place-items-center overflow-hidden rounded-xl border border-coco-green-500/30 bg-coco-green-500/10 shadow-lg shadow-coco-green-500/15'

const logoText =
  'text-base font-semibold tracking-tight text-coco-dark-text max-[360px]:hidden sm:text-lg'

const launchButton =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-coco-green-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-coco-green-500/25 transition-all hover:-translate-y-0.5 hover:bg-coco-green-600'

const desktopPill =
  'hidden items-center gap-1 rounded-2xl border border-coco-dark-border bg-coco-dark-surface/60 p-1 backdrop-blur-xl md:flex'

const desktopPillLink = ({ isActive }: { isActive: boolean }) =>
  `rounded-xl px-4 py-2 text-sm font-medium transition-all ${
    isActive
      ? 'bg-coco-green-500/15 text-coco-dark-text shadow-inner shadow-coco-green-500/10'
      : 'text-coco-dark-muted hover:bg-white/[0.03] hover:text-coco-dark-text'
  }`

const mobileToggle =
  'grid h-11 w-11 place-items-center rounded-xl border border-coco-dark-border bg-coco-dark-surface/75 text-coco-dark-muted transition-colors hover:text-coco-dark-text'

const mobilePanel =
  'border-t border-coco-dark-border bg-coco-dark-bg/95 px-3 pb-4 pt-3 shadow-coco-2 backdrop-blur-2xl md:hidden'

const mobileLink = ({ isActive }: { isActive: boolean }) =>
  `rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-coco-green-500/15 text-coco-dark-text'
      : 'text-coco-dark-muted hover:bg-coco-dark-surface hover:text-coco-dark-text'
  }`

function Logo() {
  return (
    <Link to="/" className={logoLink} aria-label="Coco DEX home">
      <span className={logoMark}>
        <img src="/coconut.svg" alt="" className="h-7 w-7 transition-transform duration-300 group-hover:rotate-12" />
      </span>
      <span className={logoText}>
        Coco <span className="text-coco-teal-400">DEX</span>
      </span>
    </Link>
  )
}

// Landing header exposes only the logo and the single Launch App entry point.
// No application navigation (Swap/Bridge/Pools/Analytics/Docs) is present, so
// Launch App is the only visible path into the application.
export function LandingHeader() {
  return (
    <header className={shell}>
      <div className={bar}>
        <Logo />
        <Link to="/swap" className={launchButton}>
          Launch App
        </Link>
      </div>
    </header>
  )
}

function DesktopNavMenu({ links }: { links: ReadonlyArray<{ to: string; label: string }> }) {
  return (
    <nav className={desktopPill} aria-label="Primary">
      {links.map(({ to, label }) => (
        <NavLink key={to} to={to} end={to === '/'} className={desktopPillLink}>
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

function MobileToggle({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={mobileToggle}
      aria-label="Toggle navigation"
      aria-expanded={isOpen}
    >
      {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
    </button>
  )
}

function MobilePanel({
  links,
  isOpen,
  onNavigate,
}: {
  links: ReadonlyArray<{ to: string; label: string }>
  isOpen: boolean
  onNavigate: () => void
}) {
  if (!isOpen) return null
  return (
    <div className={mobilePanel}>
      <nav className="grid gap-1" aria-label="Primary">
        {links.map(({ to, label }) => (
          <NavLink key={to} to={to} end={to === '/'} onClick={onNavigate} className={mobileLink}>
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export function AppHeader() {
  const [isOpen, setIsOpen] = useState(false)
  const close = () => setIsOpen(false)
  const toggle = () => setIsOpen((value) => !value)

  return (
    <header className={shell}>
      <div className={bar}>
        <Logo />
        <DesktopNavMenu links={appNavLinks} />
        <div className="hidden shrink-0 items-center gap-3 md:flex">
          <ConnectWalletButton />
        </div>
        <div className="flex min-w-0 shrink-0 items-center gap-1.5 md:hidden">
          <ConnectWalletButton />
          <MobileToggle isOpen={isOpen} onToggle={toggle} />
        </div>
      </div>
      <MobilePanel links={appNavLinks} isOpen={isOpen} onNavigate={close} />
    </header>
  )
}

export function Header() {
  const { pathname } = useLocation()
  return pathname === '/' ? <LandingHeader /> : <AppHeader />
}
