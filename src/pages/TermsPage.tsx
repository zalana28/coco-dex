import { Link } from 'react-router-dom'

export function TermsPage() {
  return (
    <article className="page-fade mx-auto min-h-[calc(100vh-4rem)] max-w-3xl px-4 pb-16 pt-28 sm:px-6 lg:px-8">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-coco-amber-500">Owner review required template</p>
      <h1 className="mt-3 text-4xl font-semibold text-coco-dark-text">Terms of Use</h1>
      <p className="mt-4 rounded-2xl border border-coco-amber-500/25 bg-coco-amber-500/10 p-4 text-sm leading-6 text-coco-dark-secondary">
        This is a minimal operational template for owner review. It has not been reviewed by legal counsel and must not be treated as final legal advice.
      </p>
      <div className="mt-8 space-y-7 text-sm leading-7 text-coco-dark-secondary">
        <section><h2 className="text-xl font-semibold text-coco-dark-text">Testnet-only software</h2><p className="mt-2">Coco DEX supports Arc Testnet and test assets only. It is unaudited and not production-ready. Do not use mainnet assets or rely on testnet behavior as a promise of future service.</p></section>
        <section><h2 className="text-xl font-semibold text-coco-dark-text">No guarantees</h2><p className="mt-2">Routes, external liquidity, transaction completion times, fees, availability, and third-party services can change or fail. Review wallet prompts, token approvals, route details, and minimum received before signing.</p></section>
        <section><h2 className="text-xl font-semibold text-coco-dark-text">User responsibility</h2><p className="mt-2">You are responsible for wallet security, test assets, network selection, approvals, and transactions you authorize. Never share a private key or wallet recovery credentials.</p></section>
        <section><h2 className="text-xl font-semibold text-coco-dark-text">Independent project</h2><p className="mt-2">No Arc or Circle endorsement, sponsorship, or certification is claimed. Product and service names belong to their respective owners.</p></section>
      </div>
      <Link to="/privacy" className="mt-10 inline-flex min-h-11 items-center rounded-xl text-sm font-semibold text-coco-teal-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coco-teal-400">Read the Privacy template</Link>
    </article>
  )
}
