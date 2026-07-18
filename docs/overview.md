# Coco DEX Overview

Coco DEX is an independent stablecoin interface that supports Arc Testnet. It compares quotes across Coco, XyloNet, UnitFlow, and Synthra so users can choose a route before signing approval or swap transactions.

## Current scope

- Network: Arc Testnet only.
- Main pair surfaced by the app: USDC and EURC.
- Route comparison: Coco direct pool, XyloNet external router, UnitFlow route using WUSDC where displayed, and Synthra V3.
- Liquidity: users can add and remove liquidity in Coco pools.
- Analytics: indexed protocol data is exposed through the analytics page and serverless API routes.
- Bridge: CCTP V2 USDC transfers from Ethereum Sepolia or Base Sepolia to Arc Testnet through Circle Bridge Kit and the Forwarding Service.

## Coco Native Stable Pool LP Beta

CocoStablePool V1 is live on Arc Testnet as an LP Beta. The Pools page shows the pool and supports tiny test add/remove liquidity flows. It remains unaudited, not routed, indexed only in separate beta observability, and not production-ready.

Read the current readiness status in `stable-pool-readiness.md` and the V2 design plan in `stable-pool-v2-plan.md`.

## Arc Testnet only

The current app is Arc Testnet software. Documentation, UI labels, and developer setup should use careful Arc Testnet wording.

## User flow

1. Connect wallet.
2. Switch to Arc Testnet.
3. Choose token pair.
4. Enter amount.
5. Compare routes.
6. Select route.
7. Approve token or route permission if needed.
8. Swap.
9. Open the transaction link.

## User-facing concepts

### Route quotes

A quote is a point-in-time estimate from a pool or router. It can become stale when liquidity, reserves, fee tier, or market conditions change.

### Best route

The app highlights the best quote from the currently available route comparison. This is not a guarantee of future execution price. Users should verify expected output and minimum received before approving or swapping.

### Approvals

Approvals are route-specific. Coco, XyloNet, UnitFlow, and Synthra can require different spenders or wallet permission flows. Users should only approve spenders and amounts they understand.

## Docs in this folder

- `routing.md`: route behavior and route-specific caveats.
- `approvals.md`: DeFi approval model and Coco DEX route spenders.
- `analytics.md`: indexed analytics behavior and lag expectations.
- `stable-pool-readiness.md`: Coco Native Stable Pool V1 beta status and release-readiness notes.
- `stable-pool-v2-plan.md`: future rate-aware V2 plan.
- `release-checklist.md`: Arc Testnet MVP release checks.
- `troubleshooting.md`: common wallet, route, and transaction failures.
- `circle-future-integrations.md`: implemented CCTP V2 Bridge plus unimplemented Circle service ideas.
- `coco-stable-pool-v1-spec.md`: Coco Native Stable Pool V1 specification and current beta notes.
- `developer-setup.md`: local setup, env vars, and verification commands.
