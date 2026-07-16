# Coco DEX

Coco DEX is an Arc Testnet DEX MVP for USDC/EURC swaps, route comparison, liquidity workflows, and indexed analytics for the classic Coco V2 pair.

- **Live demo:** https://coco-dex.vercel.app
- **Docs:** https://coco-dex.vercel.app/docs
- **Repository:** https://github.com/zalana28/coco-dex

---

## Public Arc Testnet MVP Features

- Swap USDC <-> EURC with real-time Arc Testnet quotes
- Compare Coco, XyloNet, UnitFlow, and Synthra routes before execution
- Add and remove liquidity for the classic Coco V2 USDC/EURC pool
- Track LP positions and pool share for connected wallets
- V2-style LP fee explanation (0.3% per trade)
- Arc Testnet network guard (blocks transactions on wrong chain)
- Transaction progress panel with tx hashes and explorer links
- Analytics powered by the Supabase indexer for the classic Coco V2 pair
- External cron-based analytics sync (every 15 minutes)
- Max approval mode for streamlined repeat swaps
- Public `/docs` page and markdown developer docs

The classic Coco V2 pair charges a 0.3% swap fee that remains in pair reserves
for LPs. `CocoFactory.feeTo` is currently inactive: pairs do not track `kLast`
or mint protocol LP fees. Configuring `feeTo` therefore does not collect a
protocol fee.

Classic Coco V2 contracts accept ERC-20 tokens only. On Arc, callers must use
the ERC-20 USDC balance and its token-native decimals; native gas-token USDC
amounts are not interchangeable. The router has no payable, wrapping, or
native-USDC entry points.

## Coco Native Stable Pool LP Beta

Coco Native Stable Pool V1 is visible on the Pools page as an Arc Testnet LP Beta. It supports tiny test add/remove liquidity flows for verification, but it remains:

- Unaudited.
- Not routed by the smart router.
- Indexed only in separate beta observability endpoints.
- Not production-ready.
- Arc Testnet only.

Read the current status in `docs/stable-pool-readiness.md` and the future V2 plan in `docs/stable-pool-v2-plan.md`.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Blockchain | Wagmi, Viem, Arc Testnet (Chain ID 5042002) |
| Contracts | Uniswap V2-style Factory, Router, Pair |
| Backend | Vercel Serverless Functions |
| Database | Supabase (Postgres) |
| Hosting | Vercel |

## Architecture

```
Frontend (React/Vite)
    |
    ├── Wallet / Wagmi / Viem ──► Arc Testnet Contracts
    |                              (Factory, Router, Pair)
    |
    └── Analytics UI ──► /api/analytics/* ──► Supabase Postgres
                                                    ▲
                                                    |
                              /api/cron/indexer ─────┘
                              (External cron every 15 min)
```

- **Swap/Liquidity:** Frontend connects wallet via Wagmi and sends transactions to Arc Testnet contracts via Viem.
- **Analytics:** Vercel serverless functions read indexed classic Coco V2 pair data from Supabase. An external cron service calls `/api/cron/indexer` to index new blockchain events.
- **Indexer:** Reads classic Pair contract logs (Swap, Mint, Burn, Sync) using `viem.getLogs()` and stores them in Supabase with block timestamps. Coco Native Stable Pool V1 uses separate beta observability tables and endpoints that are not merged into classic Coco V2 TVL.

## Environment Variables

Create `.env.local` from `.env.example`:

| Variable | Description | Scope |
|----------|-------------|-------|
| `VITE_PUBLIC_APP_ENV` | App environment label | Frontend |
| `VITE_WALLETCONNECT_PROJECT_ID` | WalletConnect project ID for mobile wallet connections | Frontend |
| `ARC_TESTNET_RPC_URL` | Arc Testnet RPC endpoint | Server |
| `SUPABASE_URL` | Supabase project URL | Server |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Server |
| `CRON_SECRET` | Secret for cron endpoint auth | Server |
| `CIRCLE_API_KEY` | Circle API key for server-side health checks only | Server |
| `CIRCLE_BASE_URL` | Circle API base URL, defaults to `https://api.circle.com` | Server |
| `CIRCLE_ENV` | Circle environment label, e.g. `testnet` | Server |
| `BACKFILL_FROM_BLOCK` | Start block for backfill (default: 44170190) | Script |
| `BACKFILL_TO_BLOCK` | End block for backfill (default: latest) | Script |
| `BACKFILL_CHUNK_SIZE` | Blocks per batch (default: 5000) | Script |

## Local Setup

Use Node 22 LTS for local development. Node 25 may show `EBADENGINE` warnings because some dependencies support Node 20, 22, or 24.

```bash
nvm install 22
nvm use 22
npm install
cp .env.example .env.local
npm run dev
```

## Build and Test

```bash
npm run build       # tsc -b && vite build
npm test            # vitest --run
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
```

## Analytics / Indexer Setup

1. **Run Supabase migrations in order:**
   Apply `001_analytics_schema.sql`, `002_stable_pool_observability.sql`,
   `003_pool_snapshots_unique.sql`, then `004_indexer_reliability.sql`.
   Migration 004 installs the transactional chunk-persistence RPC and the
   expiring database-backed lock required by the endpoint.

2. **Set Vercel environment variables:**
   Required: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, and
   `ARC_TESTNET_RPC_URL`. Optional bounded-run settings (defaults shown):
   `INDEXER_BATCH_SIZE=500`, `INDEXER_MAX_BLOCKS_PER_RUN=2000`, and
   `INDEXER_CONFIRMATION_BLOCKS=12`.

3. **Run initial backfill only when deliberately bootstrapping a new database:**
   ```bash
   npm run indexer:backfill
   ```

4. **Use exactly one scheduler (recommended: cron-job.org):**
   Vercel Cron is intentionally absent from `vercel.json`. Configure cron-job.org
   every 5-15 minutes with method `GET` and this mandatory header:
   ```
   Authorization: Bearer <CRON_SECRET>
   ```
   Do not also enable Vercel Cron. User-Agent headers are never trusted.

   Production smoke test (the response never includes secrets or internal errors):
   ```bash
   curl --fail-with-body \
     -H "Authorization: Bearer ${CRON_SECRET}" \
     https://coco-dex.vercel.app/api/cron/indexer
   ```

5. **Health check:**
   ```
   GET https://coco-dex.vercel.app/api/health
   ```

## Circle API Health

`/api/circle/health` is a server-side readiness endpoint for verifying that a Circle API key is configured. It only checks the Circle Wallets endpoint and does not expose secrets, wallet data, frontend keys, CCTP bridge logic, Wallets integration, Gas Station integration, or swap routing changes.

1. Create an API key in the Circle Console.
2. Add `CIRCLE_API_KEY` to `.env.local` for local development.
3. Add `CIRCLE_API_KEY` to Vercel Environment Variables.
4. Do not use `VITE_CIRCLE_API_KEY`; Circle API keys must stay server-side.
5. Redeploy after adding or changing Vercel environment variables.

Production check:

```bash
curl https://coco-dex.vercel.app/api/circle/health
```

## Security

- `SUPABASE_SERVICE_ROLE_KEY` is **server-only**. Never expose it to the frontend.
- Do not prefix server secrets with `VITE_` (Vite exposes those to the browser).
- `CRON_SECRET` must be kept private and only shared with your cron service.
- `CIRCLE_API_KEY` is **server-only**. Never expose it to frontend code and never commit real API keys.
- This project runs on **Arc Testnet** with test tokens only.

## Roadmap

- [ ] Better analytics charts (candlestick, multi-range)
- [ ] Multi-pool support
- [ ] More token pairs
- [ ] Better APR / fee yield estimates
- [ ] Health / status dashboard
- [ ] Arc Testnet release checklist
- [ ] Mobile responsive improvements

## License

MIT - see [LICENSE](./LICENSE)
