# Smart Routing

Coco DEX compares supported Arc Testnet routes before the user swaps. The route panel shows route source, expected output, minimum output, route path, execution status, and warnings when available.

## Supported routes

### Coco

- Type: direct pool route.
- Liquidity source: Coco pool liquidity.
- Pair: supported Coco stablecoin pair shown by the app.
- Approval context: Coco router spender when approval is needed.
- Price impact: computed from Coco pool reserves when reserve data is available.

CocoStablePool V1 has a tiny Arc Testnet liquidity seed for verification, but it is not yet used as a smart router source. It remains available only through the Pools page beta flow.

### XyloNet

- Type: external router route.
- Liquidity source: XyloNet external router and pool state.
- Approval context: separate token approval to the XyloNet router.
- Execution context: selected XyloNet quote must remain valid at execution time.
- Failure modes: insufficient allowance, stale quote, min received too high, pool state movement, or router revert.

### UnitFlow

- Type: Universal Router route for executable flow, with quote path shown through UnitFlow route data.
- UI path: may display `USDC -> WUSDC -> EURC` where the current route path uses WUSDC.
- WUSDC scope: WUSDC is relevant to this route path and is not a general unsupported token claim.
- Approval context: UnitFlow is route-specific. Follow the approval or wallet permission prompt shown by the app when this route is selected.
- Current caution: docs should mirror the route path shown by the UI and must not modify execution branches, min output, deadlines, or quote calculations.

### Synthra

- Type: V3 route.
- Quote model: compares Synthra V3 fee-tier quotes where available.
- Approval context: separate token approval to the Synthra router before Synthra can spend the selected token.
- Execution context: Synthra route execution occurs after approval for executable quotes.
- Failure modes: missing fee tier, insufficient allowance, stale quote, min received too high, or router revert.

## Why route prices differ

Route prices can differ because each route has different liquidity, reserves, route path, fee tier, and market state. A route that looks best at quote time can become worse or revert if pool state changes before execution.

## Best quote semantics

The `Best quote` badge is based on current app comparison among available quotes. It is not a guarantee of future execution price or transaction success.

## Minimum received

Minimum received is the route's slippage-protected output threshold. Users should review it before approval and before swap. Documentation must not change min output calculations.

## Scope lock for routing docs

Documentation changes must not modify:

- router ABIs;
- router addresses;
- token addresses;
- approval spenders;
- minAmountOut calculations;
- deadline calculations;
- simulateContract/writeContract behavior;
- quote calculations;
- swap button action logic;
- route execution branching.

The read-only External Stable Pools panel can display external pool information, but it does not mean Coco owns those external pools.
