# Coco DEX Overview

Coco DEX is a smart-routing DEX interface for Arc Testnet stablecoin swaps. It compares quotes across Coco, XyloNet, UnitFlow, and Synthra so users can choose a route before signing approval or swap transactions.

## Current scope

- Network: Arc Testnet only.
- Main pair surfaced by the app: USDC and EURC.
- Route comparison: Coco direct pool, XyloNet external router, UnitFlow route using WUSDC where displayed, and Synthra V3.
- Liquidity: users can add and remove liquidity in Coco pools.
- Analytics: indexed protocol data is exposed through the analytics page and serverless API routes.

## Planned native stable pool

CocoStablePool V1 is planned as a future native Coco stable pool for Arc Testnet. It is not live yet, and no Coco stable pool contract is currently implemented by this specification. The External Stable Pools panel is read-only and does not mean Coco owns or controls external pools.

## Not mainnet

The current app is testnet software. Documentation, UI labels, and developer setup should use careful Arc Testnet wording unless a future release explicitly adds mainnet support.

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
- `troubleshooting.md`: common wallet, route, and transaction failures.
- `circle-future-integrations.md`: Circle ideas documented as future integrations only.
- `coco-stable-pool-v1-spec.md`: planned native Coco stable pool specification.
- `developer-setup.md`: local setup, env vars, and verification commands.
