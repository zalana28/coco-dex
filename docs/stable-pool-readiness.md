# Coco Native Stable Pool Readiness

## Current V1 Status

Coco Native Stable Pool V1 is live on Arc Testnet as an LP Beta for USDC/EURC. It is visible on the Pools page and supports small test add/remove liquidity flows.

V1 remains:

- Arc Testnet only.
- LP Beta.
- Unaudited.
- Not routed by the smart router.
- Not indexed in analytics yet.
- Not production-ready.

## What Is Fixed Now

The current beta safety work improves the public Arc Testnet MVP surface without changing contracts or enabling routing:

- cSLP decimals are read dynamically from the LP token, with an 18-decimal fallback that matches OpenZeppelin ERC20 behavior.
- Add-liquidity minimum cSLP output is derived from estimated LP output and selected slippage tolerance.
- Remove-liquidity minimum USDC/EURC outputs are derived from estimated outputs and selected slippage tolerance.
- Stable pool routing guard remains disabled.
- Beta warnings are visible near stable pool write actions.
- Pools/mobile coverage checks the beta safety UI.

## Current Limitations

- Stable pool math is still V1/prototype math.
- V1 must not be presented as production-ready.
- V1 has no smart route execution.
- V1 has separate beta observability support. Stable pool telemetry is not merged into classic Coco V2 pair analytics.
- V1 has no third-party audit.
- Current liquidity is intentionally tiny and suitable only for Arc Testnet verification.

## Observability Status

Stable pool observability is separated from classic Coco V2 pair analytics. The indexer can write V1 events where available and writes reserve/LP snapshots because V1 does not emit a Uniswap-style `Sync` event.

Current stable pool endpoints:

- `/api/analytics/stable-pool/summary`
- `/api/analytics/stable-pool/events`
- `/api/analytics/stable-pool/reserves`
- `/api/analytics/stable-pool/health`

If Supabase is not configured, these endpoints return `status: "not_configured"`.

## Why USDC/EURC Needs Rate-Aware Design

USDC and EURC are both stablecoins, but they are not the same unit of account. Their fair exchange rate depends on USD/EUR market conditions, issuer risk, liquidity, and possible depeg scenarios.

A final stable pool design needs rate-aware pricing before the beta label can be removed. A fixed near-1:1 assumption can misprice EURC against USDC when the real USD/EUR rate moves. V2 should treat the pair as rate-scaled assets, require freshness checks on any rate input, and stop or restrict swaps when rate data is stale or outside configured deviation limits.

## Before Removing The Beta Label

Do not remove the LP Beta label until all of the following are complete:

- V2 contract design reviewed and implemented separately from V1.
- Rate provider interface added with freshness checks.
- Max deviation checks and circuit breaker implemented.
- Canonical or rate-scaled stable invariant selected and documented.
- `quoteAddLiquidity`, `quoteRemoveLiquidity`, `getAmountOut`, and `getAmountIn` available for frontend simulation.
- Unit, fuzz, invariant, differential, and gas snapshot tests complete.
- Third-party audit or equivalent independent review complete.
- Arc Testnet deployment runbook and rollback path reviewed.
- Analytics/indexer schema keeps stable pool telemetry separate from classic Coco V2 pair analytics.
- Smart routing remains disabled until capped Arc Testnet execution tests pass.
