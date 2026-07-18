import { Link } from 'react-router-dom'

export function PrivacyPage() {
  return (
    <article className="page-fade mx-auto min-h-[calc(100vh-4rem)] max-w-3xl px-4 pb-16 pt-28 sm:px-6 lg:px-8">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-coco-amber-500">Owner review required template</p>
      <h1 className="mt-3 text-4xl font-semibold text-coco-dark-text">Privacy Notice</h1>
      <p className="mt-4 rounded-2xl border border-coco-amber-500/25 bg-coco-amber-500/10 p-4 text-sm leading-6 text-coco-dark-secondary">
        This is a minimal operational template for owner review. It has not been reviewed by legal counsel and must not be treated as final legal advice.
      </p>
      <div className="mt-8 space-y-7 text-sm leading-7 text-coco-dark-secondary">
        <section><h2 className="text-xl font-semibold text-coco-dark-text">Public blockchain activity</h2><p className="mt-2">Wallet addresses, approvals, and transactions submitted to public testnets are public and may be indexed by blockchain explorers and Coco DEX analytics.</p></section>
        <section><h2 className="text-xl font-semibold text-coco-dark-text">Application data</h2><p className="mt-2">The application reads wallet and public chain state needed to display routes, balances, liquidity, Bridge progress, and analytics. Coco DEX does not ask for private keys or wallet recovery credentials.</p></section>
        <section><h2 className="text-xl font-semibold text-coco-dark-text">Operational services</h2><p className="mt-2">Hosting, wallet connectivity, RPC, Circle Bridge Kit infrastructure, block explorers, and analytics infrastructure may process standard request metadata under their own policies. No advertising or tracking integration is intentionally added by this release.</p></section>
        <section><h2 className="text-xl font-semibold text-coco-dark-text">Owner follow-up</h2><p className="mt-2">Before broader use, the owner must review retention, contact, jurisdiction, service-provider, and user-rights language and replace this template where required.</p></section>
      </div>
      <Link to="/terms" className="mt-10 inline-flex min-h-11 items-center rounded-xl text-sm font-semibold text-coco-teal-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coco-teal-400">Read the Terms template</Link>
    </article>
  )
}
