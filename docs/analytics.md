# Analytics

Coco DEX includes indexed analytics for classic Coco V2 pair activity on Arc Testnet. Analytics are user-facing but depend on backend indexing, database availability, and cron timing.

Coco Native Stable Pool V1 uses separate beta observability tables and endpoints. Stable pool telemetry must not be merged into classic Coco V2 pair TVL, volume, fees, or activity.

## What analytics can show

Depending on the currently indexed data, the app may show:

- TVL;
- 24h volume;
- total volume;
- fees;
- total trades;
- pool analytics;
- token analytics;
- recent activity;
- route or classic Coco V2 pool-related analytics where available;
- indexer health and lag.

## Architecture

The frontend reads analytics through serverless API routes under `/api/analytics/*` and health data through `/api/health`. The indexer stores blockchain-derived activity in Supabase.

High-level flow:

```text
Arc Testnet events -> indexer -> Supabase -> API routes -> Analytics UI
```

Classic V2 pair data is stored in `dex_events`, `pool_snapshots`, and `daily_pool_stats`.

Stable pool beta observability is stored separately in:

- `stable_pool_events`;
- `stable_pool_reserve_snapshots`;
- `stable_pool_lp_snapshots`;
- `stable_pool_indexer_runs`.

The stable pool API endpoints are:

- `/api/analytics/stable-pool/summary`;
- `/api/analytics/stable-pool/events`;
- `/api/analytics/stable-pool/reserves`;
- `/api/analytics/stable-pool/health`.

If Supabase env vars are missing, stable pool endpoints return `status: "not_configured"` instead of exposing secrets or throwing noisy responses.

## Required Environment Variables

Stable pool observability uses the same server-only environment variables as classic analytics:

- `SUPABASE_URL`;
- `SUPABASE_SERVICE_ROLE_KEY`;
- `ARC_TESTNET_RPC_URL`;
- `CRON_SECRET` for protected cron execution.

Do not expose service role keys through frontend variables.

## Stable Pool V1 Limitations

CocoStablePool V1 emits liquidity, swap, fee, pause, and unpause events, but it does not emit a Uniswap-style `Sync` event. The stable pool indexer therefore writes safe reserve and LP snapshots as the source of truth for current reserves and LP supply.

Stable pool analytics are beta observability only. They do not imply routing support, production readiness, or audit status.

## Health Verification

Use `/api/analytics/stable-pool/health` to verify the latest stable pool indexer run. The response includes Arc Testnet metadata, pool address, latest run status, and run counters when configured.

## Rollback Behavior

If stable pool observability causes issues:

- roll back the app/API deployment;
- keep stable pool routing disabled;
- do not modify contracts;
- do not merge stable pool rows into classic analytics tables;
- keep V1 withdrawable and visible as LP Beta.

## Lag expectations

Analytics can lag behind the latest wallet transaction. Common causes:

- indexer cron interval has not run yet;
- serverless function cold start or API delay;
- RPC lag;
- Supabase query delay;
- latest block is ahead of last indexed block.

Users should rely on transaction links for immediate transaction confirmation and analytics for indexed protocol views after sync.

## Canonical scheduler

The canonical production scheduler is cron-job.org. It sends one authenticated `GET /api/cron/indexer` every 15 minutes using an `Authorization: Bearer …` header. Vercel Cron must remain disabled in `vercel.json`; do not run both schedulers. Configure failure alerts for non-2xx responses, then recover by fixing the RPC/database/configuration issue, rerunning the authenticated endpoint, and verifying HTTP 200 plus `/api/health` lag.

## Security

`SUPABASE_SERVICE_ROLE_KEY` is server-only. It must never be exposed through frontend code or a `VITE_` variable.
