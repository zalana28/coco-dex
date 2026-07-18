# Arc Testnet Submission Release Checklist

Use this checklist before presenting a specific Coco DEX deployment for Arc Testnet review. Coco DEX is unaudited testnet software and is not production-ready.

## Build identity and repository proof

- Review `docs/implementation-evidence.md` for the starting SHA, package versions, routes, and configured addresses.
- Record repository `main` SHA: `git rev-parse origin/main`.
- Record candidate/deployed SHA from `/api/version` and the global footer.
- Confirm public `main`, PR head, footer SHA, `/api/version.gitCommitSha`, and Vercel deployment SHA agree.
- Configure `BUILD_TIMESTAMP` as an ISO deployment value and verify `/api/version.buildTimestamp`; without it, the endpoint uses serverless module initialization time as a documented fallback.
- Confirm `/api/version` exposes only application, environment label, SHA, timestamp, Arc Testnet chain ID, public feature flags, and application version.
- Confirm no environment values, RPC URLs, credentials, wallet data, cron secrets, or internal paths appear in `/api/version`.

## Required local gates

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run test:mobile
npm run contracts:test
git diff --check
```

- Build-time public-bundle secret scan passes.
- No tracked `.env*`, `.vercel/`, `screenshots/`, `supabase/.temp/`, private keys, or seed phrases.

## Desktop and mobile application checks

Check `/bridge`, `/swap`, `/pools`, `/analytics`, `/docs`, `/terms`, and `/privacy` at:

- 320×700
- 360×800
- iPhone 13
- Pixel 5
- 768×1024
- 1280×800
- 1440×900

For each relevant route:

- no horizontal overflow;
- keyboard focus is visible;
- footer remains secondary and links are keyboard reachable;
- Terms and Privacy pages show the owner-review-required template warning;
- Arc attribution is descriptive (`Supports Arc Testnet`) and secondary to Coco DEX;
- no wording implies Arc/Circle endorsement, partnership, certification, or sponsorship.

## Bridge verification

- `/bridge` appears in route configuration and application navigation.
- Ethereum Sepolia → Arc Testnet estimate renders.
- Base Sepolia → Arc Testnet estimate renders.
- Only USDC is offered; EURC is not described as bridgeable.
- Estimate displays protocol, forwarding, and source gas context without guaranteed duration/cost claims.
- Dialog traps focus, closes with Escape, inerts background content, and restores focus to its trigger.
- Approval, burn, attestation, and Forwarding Service mint lifecycle are visible.
- Refresh after a recorded successful burn restores recovery state.
- Recovery calls `retryBridge` and does not repeat the successful burn.
- No Circle API key is required for the connected browser-wallet Bridge path.

## Swap, liquidity, and contracts

- Coco Classic V2 quote, approval, swap, and receipt flow work.
- Route comparison discloses that external availability is not guaranteed.
- Add/remove liquidity works with tiny Arc Testnet amounts.
- Current frontend/indexer addresses match `src/config/contracts.ts` and footer Arcscan links.
- The newer `contracts/deployments/classic-v2-arc-testnet.json` record remains explicitly not activated unless a separate migration is approved.
- Stable Pool is labeled LP Beta, unaudited, not production-ready, and not routed.
- Stable-pool observability remains separate from classic V2 metrics.
- Do not deploy or modify contracts during this checklist.

## Security headers and browser compatibility

- Deployed responses include `nosniff`, strict-origin referrer policy, restrictive Permissions Policy, frame denial, and popup-compatible opener policy.
- CSP remains Report-Only until the promotion gate in `docs/security-headers.md` is complete.
- No `unsafe-eval`; `unsafe-inline` is absent from `script-src`.
- Injected wallet connection and Arc network switching work.
- WalletConnect pairing/reconnect works when configured.
- Swap and Bridge flows produce no unexplained CSP violations.
- No browser request goes directly to Supabase service-role APIs.
- No unexpected analytics/tracking request appears.

## Scheduler and indexer health

- `vercel.json` contains no Vercel Cron configuration.
- cron-job.org is the single scheduler, set to authenticated `GET /api/cron/indexer` every 15 minutes.
- Authorization header is `Bearer <CRON_SECRET>` and never logged/shared publicly.
- cron-job.org alerts on non-2xx responses.
- Authenticated indexer smoke test returns HTTP 200 (`success`, `up_to_date`, or `skipped_overlap`).
- `/api/health` returns HTTP 200 and indexer lag is reviewed.
- On failure, fix RPC/database/configuration, rerun the authenticated endpoint, and verify cursor progress; do not enable a second scheduler.

## Documentation and wording review

- README and `/docs` describe Coco Classic V2, Coco liquidity, route comparison, CCTP V2 Bridge, Forwarding Service, and recovery accurately.
- Arc Testnet EVM chain ID `5042002` and CCTP domain `26` are described as separate typed concepts.
- ERC-20 USDC application units are 6 decimals; native Arc gas raw units are 18 decimals.
- `/api/circle/health` is described as an optional server/admin diagnostic.
- No formal audit, production readiness, guaranteed finality/cost/liquidity, EURC Bridge, partnership, or endorsement claim appears.
- Footer shows Docs, GitHub, contracts, Terms, Privacy, `Supports Arc Testnet`, unaudited, and not-production-ready disclaimers.

## Rollback

If the candidate has a functional blocker:

1. Roll back the Vercel deployment to the previous known-good SHA.
2. Verify the restored SHA through `/api/version` and the footer.
3. If caused by browser headers, revert only the `vercel.json` header change and retest wallets/Bridge.
4. If caused by docs/footer/legal UI, revert the application commit without modifying contracts or transaction logic.
5. Keep Stable Pool routing disabled and retain separate observability.
6. Preserve transaction hashes, indexer logs, CSP reports, and CI artifacts for diagnosis.
7. Rerun every required gate before redeploying.
