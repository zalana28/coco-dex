import { ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import { COCO_STABLE_POOL_ADDRESS, COCO_STABLE_LP_TOKEN_ADDRESS } from '@/config/cocoStablePool'
import { FACTORY_ADDRESS, ROUTER_ADDRESS, USDC_EURC_PAIR_ADDRESS } from '@/config/contracts'
import { PUBLIC_BUILD, shortCommitSha } from '@/config/build'

const contracts = [
  ['Factory', FACTORY_ADDRESS],
  ['Router', ROUTER_ADDRESS],
  ['USDC/EURC Pair', USDC_EURC_PAIR_ADDRESS],
  ['Stable Pool Beta', COCO_STABLE_POOL_ADDRESS],
  ['Stable LP Token', COCO_STABLE_LP_TOKEN_ADDRESS],
] as const

const focus = 'rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coco-teal-400 focus-visible:ring-offset-2 focus-visible:ring-offset-coco-dark-bg'

export function Footer() {
  return (
    <footer className="relative border-t border-coco-dark-border/70 bg-coco-dark-bg/75 text-coco-dark-muted" aria-label="Coco DEX public information">
      <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-7 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:px-8">
        <div className="min-w-0">
          <p className="font-semibold text-coco-dark-text">Coco DEX</p>
          <p className="mt-1 text-xs leading-5">Supports Arc Testnet. Arc Testnet only.</p>
          <p className="mt-3 max-w-xl text-xs leading-5 text-coco-dark-muted">
            Unaudited testnet software. Not production-ready. Independent project; no Arc or Circle endorsement, sponsorship, or certification is claimed.
          </p>
          <p className="mt-3 text-xs" data-testid="deployed-commit">
            Build <code className="text-coco-dark-secondary">{shortCommitSha()}</code>
            <span className="sr-only"> from commit {PUBLIC_BUILD.gitCommitSha}</span>
          </p>
        </div>

        <div className="grid min-w-0 gap-5 sm:grid-cols-2">
          <nav aria-label="Footer" className="flex flex-wrap content-start gap-x-4 gap-y-3 text-sm">
            <Link to="/docs" className={`${focus} hover:text-coco-teal-400`}>Docs</Link>
            <a href="https://github.com/zalana28/coco-dex" target="_blank" rel="noopener noreferrer" className={`${focus} inline-flex items-center gap-1 hover:text-coco-teal-400`}>
              GitHub <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
            <Link to="/terms" className={`${focus} hover:text-coco-teal-400`}>Terms</Link>
            <Link to="/privacy" className={`${focus} hover:text-coco-teal-400`}>Privacy</Link>
          </nav>

          <details className="min-w-0 text-xs">
            <summary className={`${focus} min-h-11 cursor-pointer select-none py-3 font-medium text-coco-dark-secondary hover:text-coco-dark-text`}>
              Deployed contracts
            </summary>
            <dl className="grid min-w-0 gap-3 border-l border-coco-dark-border pl-3">
              {contracts.map(([label, address]) => (
                <div key={label} className="min-w-0">
                  <dt>{label}</dt>
                  <dd className="mt-1 min-w-0">
                    <a
                      href={`https://testnet.arcscan.app/address/${address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${focus} block truncate font-mono text-coco-dark-secondary hover:text-coco-teal-400`}
                      title={address}
                    >
                      {address}
                    </a>
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        </div>
      </div>
    </footer>
  )
}
