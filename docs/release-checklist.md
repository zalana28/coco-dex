# Arc Testnet MVP Release Checklist

Use this checklist before presenting Coco DEX as a public Arc Testnet MVP.

## Required Local Checks

Run from the repository root:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
npm run test:mobile
npm run contracts:test
```

## Vercel Preview Checklist

- Preview deploy builds successfully.
- Preview environment has Arc Testnet variables configured.
- Server-only secrets are not exposed through `VITE_` variables.
- `/api/health` returns a healthy response.
- `/api/circle/health` does not expose secrets.
- Analytics pages load gracefully if indexer data is delayed.
- Arcscan links point to Arc Testnet.

## App Smoke Checks

- `/swap` loads on desktop and mobile.
- `/pools` loads on desktop and mobile.
- `/pools` has no mobile horizontal overflow.
- Coco Native Stable Pool badges are visible: Arc Testnet, LP Beta, Unaudited, Not Routed.
- Stable pool warning is visible near write actions: Arc Testnet LP Beta, tiny test amounts only, unaudited, not routed, not indexed.
- Stable Pool Observability shows configured status or the fallback copy: "Stable pool analytics are not configured yet."
- `/analytics` keeps classic Coco V2 pair metrics separate from stable pool beta analytics.
- `/docs` uses Arc Testnet wording.

## Wallet And Network Checks

- Wallet connect works on desktop injected wallets.
- WalletConnect appears where configured for mobile.
- Wrong network state blocks swap, approval, add liquidity, and remove liquidity actions.
- Switch-to-Arc-Testnet prompt appears when wallet is connected to another chain.
- Transaction progress panels show hashes and Arcscan links.

## Tiny Stable Pool Beta Checks

Use only tiny Arc Testnet amounts.

- Add Liquidity shows slippage presets: 0.1%, 0.5%, 1.0%.
- Add Liquidity derives min cSLP output from estimated cSLP output and slippage.
- Remove Liquidity shows 25%, 50%, 75%, and Max buttons.
- Remove Liquidity shows estimated USDC and EURC outputs before enabling removal.
- Remove Liquidity derives min outputs from estimated outputs and slippage.
- Rejected wallet actions leave the user in a recoverable retry/reset state.

## Stable Pool Observability Checks

- Apply `supabase/migrations/002_stable_pool_observability.sql` before enabling stable pool API checks.
- Confirm `/api/analytics/stable-pool/health` returns `not_configured` when Supabase env vars are absent.
- Confirm `/api/analytics/stable-pool/health` returns latest run metadata when configured.
- Confirm stable pool rows are written only to `stable_pool_*` tables.
- Confirm classic `/api/analytics/summary` does not include stable pool TVL.

## Rollback Checklist

If a preview or release has a user-facing issue:

- Disable or roll back the Vercel deployment to the previous known-good build.
- Keep stable pool routing disabled.
- Roll back stable pool observability by reverting the app/API deployment; do not drop classic analytics tables.
- Do not deploy or modify contracts as part of an app rollback.
- Pause Coco Native Stable Pool V1 from the owner wallet only if an on-chain emergency requires it.
- Announce that the affected surface is Arc Testnet only.
- Preserve transaction hashes and logs for diagnosis.
- Run the required local checks again before redeploying.
