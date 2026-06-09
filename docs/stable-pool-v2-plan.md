# Coco Native Stable Pool V2 Plan

V2 should be a new contract deployment, not an upgrade of V1. V1 should remain withdrawable and readable while V2 is designed, tested, reviewed, and deployed separately on Arc Testnet.

## Design Direction

USDC/EURC needs rate-aware design because the pair tracks different fiat units. V2 should not assume USDC and EURC are interchangeable at a fixed 1:1 rate. The pool should scale balances by a fresh, bounded USD/EUR rate and stop unsafe actions when rate data is stale or outside configured limits.

## Required V2 Contract Items

- Rate provider interface.
- Rate freshness checks.
- Max deviation checks.
- Circuit breaker for stale, missing, or unsafe rate conditions.
- Canonical or rate-scaled stable invariant.
- `quoteAddLiquidity`.
- `quoteRemoveLiquidity`.
- `getAmountOut`.
- `getAmountIn`.
- `addLiquidity`.
- `removeLiquidity`.
- `swap`.
- `pause`.
- `unpause`.
- Config events for rate provider, freshness window, deviation limit, fee, pause state, and circuit breaker state.

## Required Tests

- Unit tests for all external functions and revert paths.
- Fuzz tests for add/remove/swap bounds and rounding.
- Invariant tests for reserves, LP supply, accounting, and circuit breaker behavior.
- Differential tests against an independent reference model.
- Gas snapshot tests for quote, add, remove, and swap paths.

## Audit Checklist

- Fixed token pair and token ordering documented.
- Rate provider trust assumptions documented.
- Rate scaling precision and rounding reviewed.
- Stale-rate and deviation behavior reviewed.
- Circuit breaker behavior tested and documented.
- Reentrancy review complete.
- ERC20 transfer behavior reviewed.
- Admin controls minimized and documented.
- Pool token rescue restrictions reviewed.
- No hidden owner path can drain pool reserves.
- Frontend quote functions match contract execution math.
- Indexer/event schema reviewed before analytics launch.
- Independent review or audit completed before removing beta labels.

## V1 Migration Plan

- Keep V1 withdrawable and readable.
- Keep V1 clearly labeled as Arc Testnet LP Beta while it remains visible.
- Deploy V2 separately after review.
- Update frontend config only after V2 deployment validation.
- Keep V2 routing disabled until capped Arc Testnet execution tests pass.
- Document redeem-then-add migration: users remove liquidity from V1, receive USDC/EURC, then add to V2 if they choose.
- Do not auto-migrate user funds.
- Keep analytics separated by pool address and pool generation.
