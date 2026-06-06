# Coco DEX

A lightweight Arc Testnet AMM for swapping USDC/EURC, providing liquidity, and tracking real indexed analytics.

- **Live demo:** https://coco-dex.vercel.app
- **Docs:** https://coco-dex.vercel.app/docs
- **Repository:** https://github.com/zalana28/coco-dex

---

## Features

- Swap USDC <-> EURC with real-time quotes
- Add liquidity to the USDC/EURC pool
- Remove liquidity with withdrawable LP amount display
- LP position tracking with pool share percentage
- V2-style LP fee explanation (0.3% per trade)
- Arc Testnet network guard (blocks transactions on wrong chain)
- Transaction progress panel with tx hashes and explorer links
- Real analytics powered by Supabase indexer
- External cron-based analytics sync (every 15 minutes)
- Max approval mode for streamlined repeat swaps
- Public `/docs` page and markdown developer docs
- CocoStablePool V1 specification in `docs/coco-stable-pool-v1-spec.md`

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

- **Swap/Liquidity:** Frontend connects wallet via Wagmi, sends transactions to Arc Testnet contracts via Viem.
- **Analytics:** Vercel serverless functions read indexed data from Supabase. An external cron service calls `/api/cron/indexer` to index new blockchain events.
- **Indexer:** Reads Pair contract logs (Swap, Mint, Burn, Sync) using `viem.getLogs()`, stores them in Supabase with block timestamps.

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

1. **Run Supabase migration:**
   Apply `supabase/migrations/001_analytics_schema.sql` to your Supabase project.

2. **Set Vercel environment variables:**
   Add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, and `ARC_TESTNET_RPC_URL` in Vercel project settings.

3. **Run initial backfill:**
   ```bash
   npm run indexer:backfill
   ```

4. **Set up external cron:**
   Configure a cron service (e.g., cron-job.org) to call:
   ```
   GET https://coco-dex.vercel.app/api/cron/indexer
   Authorization: Bearer <CRON_SECRET>
   ```
   Recommended interval: every 5-15 minutes.

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
- [ ] Mainnet readiness checklist
- [ ] Mobile responsive improvements

## License

MIT - see [LICENSE](./LICENSE)
