import { Link, NavLink } from 'react-router-dom'
import { ConnectWalletButton } from '@/components/common/ConnectWalletButton'

const navLinks = [
  { to: '/swap', label: 'Swap' },
  { to: '/pools', label: 'Pools' },
  { to: '/analytics', label: 'Analytics' },
]

export function Navbar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-coco-dark-border/50 bg-coco-dark-bg/80 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
        <div className="flex h-14 sm:h-16 items-center justify-between gap-2">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-1.5 sm:gap-2 shrink-0 group">
            <img src="/coconut.svg" alt="" className="h-7 w-7 sm:h-8 sm:w-8 transition-transform group-hover:rotate-12" />
            <span className="text-base sm:text-lg font-semibold text-coco-dark-text tracking-tight">
              Coco <span className="text-coco-green-500">DEX</span>
            </span>
          </Link>

          {/* Navigation — desktop */}
          <nav className="hidden sm:flex items-center gap-1">
            {navLinks.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-coco-green-500 bg-coco-green-500/10'
                      : 'text-coco-dark-muted hover:text-coco-dark-text hover:bg-coco-dark-surface'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Wallet Connect */}
          <div className="shrink-0 min-w-0">
            <ConnectWalletButton />
          </div>
        </div>
      </div>

      {/* Mobile Navigation — second row */}
      <nav className="sm:hidden flex items-center justify-center gap-1 px-3 pb-2.5 -mt-0.5">
        {navLinks.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `px-4 py-2 rounded-lg text-sm font-medium transition-colors min-h-[40px] flex items-center ${
                isActive
                  ? 'text-coco-green-500 bg-coco-green-500/10'
                  : 'text-coco-dark-muted hover:text-coco-dark-text'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </header>
  )
}
