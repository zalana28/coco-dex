# Coco DEX

Coco DEX is an independent Arc Testnet application for Coco Classic V2 swaps and liquidity, route comparison, CCTP V2 USDC transfers, and indexed testnet analytics.

- **Hosted demo:** https://coco-dex.vercel.app
- **Docs:** https://coco-dex.vercel.app/docs
- **Repository:** https://github.com/zalana28/coco-dex
- **Public build metadata:** https://coco-dex.vercel.app/api/version

Coco DEX supports Arc Testnet. It is unaudited testnet software and is not production-ready. No Arc, Circle, or external-liquidity-provider endorsement, sponsorship, certification, or partnership is claimed.

## Current implementation

- Coco Classic V2 USDC/EURC swaps and add/remove liquidity.
- Route comparison across Coco, XyloNet, UnitFlow, and Synthra when those routes are available. External route availability and liquidity are not guaranteed.
- `/bridge` transfers **USDC only** from Ethereum Sepolia or Base Sepolia to Arc Testnet using Circle Bridge Kit, the Viem v2 adapter, CCTP V2, and Circle's Forwarding Service.
- Bridge lifecycle: source approval, successful burn, attestation, and forwarded destination mint.
- Recovery uses `retryBridge` with the recorded Bridge Kit result so a successful burn is not repeated after refresh/interruption.
- Indexed classic Coco V2 analytics. Stable-pool beta observability is indexed separately and excluded from classic V2 TVL, volume, fees, and activity.
- Public Docs, Terms/Privacy owner-review-required templates, responsive footer, and public build identity.

Bridge limitations:

- EURC is not bridgeable through the CCTP Bridge page.
- Transfer duration, fees, external service availability, and finality are not guaranteed.
- A Circle API key is **not required** for the connected browser-wallet Bridge path.
- `/api/circle/health` is an optional server/admin diagnostic only; it is not part of Bridge execution.

## Chain identifiers and units

Arc Testnet EVM chain ID and CCTP domain are separate concepts and separate types:

| Concept | Value | Use |
|---|---:|---|
| Arc Testnet EVM chain ID | `5042002` | Wallet/network and EVM RPC selection |
| Arc CCTP domain | `26` | CCTP message routing |

ERC-20 USDC application transfers, balances, allowances, and approvals use **6-decimal units**. Native Arc gas accounting uses **18-decimal raw EVM units**. They must not be mixed.

## Public routes

| Route | Purpose |
|---|---|
| `/` | Landing page |
| `/swap` | Coco Classic V2 and external route comparison |
| `/bridge` | CCTP V2 USDC transfer into Arc Testnet |
| `/pools` | Coco liquidity and Stable Pool LP Beta |
| `/pools/add`, `/pools/remove` | Liquidity flow routes |
| `/analytics` | Indexed testnet activity |
| `/docs` | Public application documentation |
| `/terms`, `/privacy` | Owner-review-required legal templates |

Direct app URLs work without an authentication or session gate.

## Public Arc Testnet configuration

These are the addresses currently configured by the frontend and indexer. They are public addresses, not secrets.

| Component | Address |
|---|---|
| Coco Classic V2 Factory | `0xE1E39F01207cD3f56d3b2a69B757cf2b59c8e5bE` |
| Coco Classic V2 Router | `0xC31166847A4CEC31629a0ABe4E6383B3CD75732A` |
| Coco Classic V2 USDC/EURC Pair | `0x0eEA9DC9153215B15b1E6c43f4D68779002d4F1c` |
| ERC-20 USDC | `0x3600000000000000000000000000000000000000` |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| Coco Stable Pool LP Beta | `0x0EA7A79F8864091ac7F2B8643BaA7598a9d05a83` |
| Stable LP token | `0xfE4A959c689019E09f584F25114Bb5A5e2aA8499` |

`contracts/deployments/classic-v2-arc-testnet.json` records a newer deployment that is **not activated in the current frontend/indexer configuration**. This PR does not migrate contracts or addresses.

## Stable Pool LP Beta

The Stable Pool remains Arc Testnet-only, unaudited, not production-ready, and not routed by the smart router. Use tiny test amounts only. Its observability is indexed separately from Coco Classic V2 analytics.

## Architecture

```text
React/Vite browser
  ├─ Wagmi/Viem ──> Arc Testnet contracts and route providers
  ├─ Circle Bridge Kit ──> CCTP V2 / Forwarding Service
  └─ /api/analytics/* ──> Vercel serverless ──> Supabase

cron-job.org (15 minutes, authenticated GET)
  └─ /api/cron/indexer ──> Arc RPC + Supabase
```

## Canonical scheduler

The **canonical production scheduler is cron-job.org**, configured exactly once to call `GET /api/cron/indexer` every **15 minutes**. Vercel Cron is intentionally absent from `vercel.json`. Do not also enable Vercel Cron.

Required header:

```text
Authorization: Bearer <CRON_SECRET>
```

Behavior and recovery:

- missing `CRON_SECRET` fails closed with HTTP 503;
- invalid/missing authorization returns HTTP 401;
- overlapping executions return HTTP 200 with `skipped_overlap`;
- successful runs checkpoint every persisted chunk;
- failures return sanitized HTTP 500 and do not advance an unpersisted cursor;
- cron-job.org should alert on non-2xx responses; after correcting the dependency/RPC/database issue, rerun the authenticated endpoint and verify HTTP 200 plus `/api/health` lag.

Hosted endpoint smoke test (never put the real secret in docs, logs, or shell history):

```bash
curl --fail-with-body -H "Authorization: Bearer <redacted>" \
  https://coco-dex.vercel.app/api/cron/indexer
```

## Environment variables

Copy `.env.example` to `.env.local`. Server-only values must never use a `VITE_` prefix.

| Variable | Scope | Purpose |
|---|---|---|
| `VITE_PUBLIC_APP_ENV` | Browser-public | Environment label |
| `VITE_WALLETCONNECT_PROJECT_ID` | Browser-public | WalletConnect project identifier |
| `BUILD_TIMESTAMP` | Server public metadata | Recommended ISO build timestamp for `/api/version`; module initialization time is the safe fallback |
| `ARC_TESTNET_RPC_URL` | Server secret/config | Indexer RPC |
| `SUPABASE_URL` | Server config | Analytics database endpoint |
| `SUPABASE_SERVICE_ROLE_KEY` | Server secret | Supabase administrative access |
| `CRON_SECRET` | Server secret | Indexer authentication |
| `CIRCLE_API_KEY` | Server secret, optional | `/api/circle/health` diagnostic only |

## Browser security policy

`vercel.json` enforces `nosniff`, strict-origin referrers, a restrictive Permissions Policy, frame denial, and popup-compatible opener isolation. CSP is initially **Content-Security-Policy-Report-Only** with explicit origins for Arc RPC, Ethereum/Base Sepolia RPC, Circle CCTP/telemetry, WalletConnect, and Google Fonts. Supabase is server-only and is not allowed in browser CSP.

Promote CSP to enforcement only after real-wallet verification of injected wallet connection, WalletConnect pairing/reconnect, network switching, swaps, Bridge estimation/lifecycle/recovery, and mobile Playwright. The local Vite preview does not apply Vercel headers.

See `docs/security-headers.md` for the origin inventory and rollout procedure.

## Local setup and verification

```bash
nvm use 22
npm install
cp .env.example .env.local
npm run dev

npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run test:mobile
npm run contracts:test
git diff --check
```

The build includes a public-bundle secret scan. No contract deployment is part of this workflow.

## Release review

Use `docs/release-checklist.md`. The starting implementation snapshot is recorded in `docs/implementation-evidence.md`. The footer and `/api/version` expose the public commit identity so reviewers can compare the hosted deployment with repository `main`.

## License

MIT — see [LICENSE](./LICENSE).

Product and service names belong to their respective owners.