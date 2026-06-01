import { useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { ConnectWalletButton } from '@/components/common/ConnectWalletButton'

const navLinks = [
  { to: '/', label: 'Home' },
  { to: '/swap', label: 'Swap' },
  { to: '/pools', label: 'Pools' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/docs', label: 'Docs' },
]

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false)
  const { pathname } = useLocation()
  const showWallet = pathname !== '/'
  const showLaunchApp = pathname === '/'

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-coco-dark-border/70 bg-coco-dark-bg/75 shadow-[0_12px_40px_rgba(2,6,23,0.28)] backdrop-blur-2xl">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-3">
          <Link to="/" className="group flex shrink-0 items-center gap-2" onClick={() => setIsOpen(false)}>
            <span className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-xl border border-coco-green-500/30 bg-coco-green-500/10 shadow-lg shadow-coco-green-500/15">
              <img src="/coconut.svg" alt="" className="h-7 w-7 transition-transform duration-300 group-hover:rotate-12" />
            </span>
            <span className="text-base font-semibold tracking-tight text-coco-dark-text max-[360px]:hidden sm:text-lg">
              Coco <span className="text-coco-teal-400">DEX</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 rounded-2xl border border-coco-dark-border bg-coco-dark-surface/60 p-1 backdrop-blur-xl md:flex">
            {navLinks.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-coco-green-500/15 text-coco-dark-text shadow-inner shadow-coco-green-500/10'
                      : 'text-coco-dark-muted hover:bg-white/[0.03] hover:text-coco-dark-text'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden shrink-0 items-center gap-3 md:flex">
            {showLaunchApp && (
              <Link
                to="/swap"
                className="rounded-xl bg-coco-green-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-coco-green-500/25 transition-all hover:-translate-y-0.5 hover:bg-coco-green-600"
              >
                Launch App
              </Link>
            )}
            {showWallet && <ConnectWalletButton />}
          </div>

          <div className="flex shrink-0 items-center gap-2 md:hidden">
            {showWallet && <ConnectWalletButton />}
            <button
              type="button"
              onClick={() => setIsOpen((value) => !value)}
              className="grid h-11 w-11 place-items-center rounded-xl border border-coco-dark-border bg-coco-dark-surface/75 text-coco-dark-muted transition-colors hover:text-coco-dark-text"
              aria-label="Toggle navigation"
              aria-expanded={isOpen}
            >
              {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="border-t border-coco-dark-border bg-coco-dark-bg/95 px-3 pb-4 pt-3 shadow-coco-2 backdrop-blur-2xl md:hidden">
          <nav className="grid gap-1">
            {navLinks.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                onClick={() => setIsOpen(false)}
                className={({ isActive }) =>
                  `rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-coco-green-500/15 text-coco-dark-text'
                      : 'text-coco-dark-muted hover:bg-coco-dark-surface hover:text-coco-dark-text'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          {showLaunchApp && (
            <div className="mt-3 grid gap-3">
              <Link
                to="/swap"
                onClick={() => setIsOpen(false)}
                className="rounded-xl bg-coco-green-500 px-4 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-coco-green-500/25 transition-all hover:bg-coco-green-600"
              >
                Launch App
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  )
}
