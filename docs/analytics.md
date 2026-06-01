# Analytics

Coco DEX includes indexed analytics for protocol activity. Analytics are user-facing but depend on backend indexing, database availability, and cron timing.

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
- route or pool-related analytics where available;
- indexer health and lag.

## Architecture

The frontend reads analytics through serverless API routes under `/api/analytics/*` and health data through `/api/health`. The indexer stores blockchain-derived activity in Supabase.

High-level flow:

```text
Arc Testnet events -> indexer -> Supabase -> API routes -> Analytics UI
```

## Lag expectations

Analytics can lag behind the latest wallet transaction. Common causes:

- indexer cron interval has not run yet;
- serverless function cold start or API delay;
- RPC lag;
- Supabase query delay;
- latest block is ahead of last indexed block.

Users should rely on transaction links for immediate transaction confirmation and analytics for indexed protocol views after sync.

## Security

`SUPABASE_SERVICE_ROLE_KEY` is server-only. It must never be exposed through frontend code or a `VITE_` variable.

## Docs PR scope

Docs changes must not modify analytics/indexer logic, Supabase queries, cron behavior, or event parsing.
