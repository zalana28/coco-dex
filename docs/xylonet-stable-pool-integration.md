# XyloNet Stable Pool Integration Research

## Summary

XyloNet is an external stablecoin DeFi protocol on Arc testnet. Its documentation describes a StableSwap AMM for low-slippage stablecoin trading, liquidity pools with ERC-20 LP tokens, and a 0.04% swap fee.

This note covers the read-only integration surface Coco DEX can safely display before deciding whether to build a native Coco StablePool contract.

CocoStablePool V1 is planned as a future native Coco stable pool and is documented separately in `coco-stable-pool-v1-spec.md`. It is not live yet. The External Stable Pools panel is read-only and does not mean Coco owns or controls XyloNet or other external pools.

Sources:

- XyloNet docs: https://www.xylonet.xyz/docs
- XyloNet liquidity pools docs: https://www.xylonet.xyz/docs/pools
- XyloNet integration guide: https://www.xylonet.xyz/docs/integration
- XyloNet architecture docs: https://www.xylonet.xyz/docs/architecture
- Arcscan USDC/EURC pool: https://testnet.arcscan.app/address/0x3DF3966F5138143dce7a9cFDdC2c0310ce083BB1
- Arcscan USDC/USYC pool: https://testnet.arcscan.app/address/0x8296cC7477A9CD12cF632042fDDc2aB89151bb61

## StableSwap vs Constant Product

Coco's current native pool UI is built around a V2-style constant-product AMM. That model uses the `x*y=k` invariant and is simple, but it can create meaningful slippage when both assets are expected to trade close to a stable reference value.

XyloNet documents its AMM as a Curve-style StableSwap design. StableSwap blends constant-sum-like behavior near the peg with constant-product-like behavior when reserves diverge. For stablecoin pairs, that can keep execution closer to the expected price while still preserving pool solvency under imbalance.

XyloNet documents amplification `A=100` for its stable pools and a 0.04% swap fee. The diagnostic script did not verify `A` or `fee` through pool contract read functions; those values are documentation-verified only.

## Addresses

| Item | Address | Status |
| --- | --- | --- |
| XyloNet router | `0x73742278c31a76dBb0D2587d03ef92E6E2141023` | Already used by Coco XyloNet route |
| USDC/EURC pool | `0x3DF3966F5138143dce7a9cFDdC2c0310ce083BB1` | Docs-listed and read-verified |
| USDC/USYC pool | `0x8296cC7477A9CD12cF632042fDDc2aB89151bb61` | Docs-listed and read-verified, currently empty |
| USDC | `0x3600000000000000000000000000000000000000` | Symbol/decimals read-verified |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | Symbol/decimals read-verified |
| USYC | `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C` | Symbol/decimals read-verified |

Arcscan pages exist for both pool addresses, but source verification status was not available from the accessible Arcscan HTML during this pass. Treat contract verification as unknown until Arcscan source/ABI can be inspected directly.

## Read Functions Verified

The diagnostic script `scripts/debugXylonetStablePools.ts` ran read-only calls on Arc testnet.

For `USDC/EURC` pool:

- `USDC.balanceOf(pool)` worked and showed pool-held USDC reserves.
- `EURC.balanceOf(pool)` worked and showed pool-held EURC reserves.
- `token0()` worked and returned USDC.
- `token1()` worked and returned EURC.
- `totalSupply()` worked and returned LP token supply.
- `balanceOf(account)` is supported by the LP token surface and is read when `XYLONET_POOL_DEBUG_ACCOUNT` is set.

For `USDC/USYC` pool:

- `USDC.balanceOf(pool)` worked and returned `0`.
- `USYC.balanceOf(pool)` worked and returned `0`.
- `token0()` worked and returned USDC.
- `token1()` worked and returned USYC.
- `totalSupply()` worked and returned `0`.

The USDC/USYC pool address exists in XyloNet docs and has bytecode on Arc testnet, but it currently appears empty by token balances and LP total supply.

## Read Functions Not Verified

The following candidate pool reads failed or reverted in the diagnostic script:

- `coins(uint256)`
- `tokens(uint256)`
- `balances(uint256)`
- `getReserves()`
- `fee()`
- `get_virtual_price()`
- `A()`
- `amp()`
- `amplification()`

These should not be used for Coco UI until verified against a published ABI or direct source inspection.

## Write Function Shapes

XyloNet docs describe liquidity add/remove flows and events, including balanced and single-sided deposits, but this PR does not implement or depend on any write functions.

Discoverable from docs only:

- Add liquidity receives token amounts and mints LP tokens.
- Remove liquidity burns LP tokens and returns pool tokens.
- Single-sided deposits/removals are documented as supported by XyloNet UI.

Exact contract function signatures are unknown in this pass because the pool source/ABI was not available from accessible Arcscan content.

## Safe Integration Now

Safe now:

- Read-only External Stable Pools panel on Coco Pools page.
- Display XyloNet USDC/EURC pool source, type, pair, fee from docs, pool-held token balances, approximate TVL, LP total supply, and user LP balance when connected.
- Link out to XyloNet and Arcscan.
- Diagnostic script for future verification.

Not safe in this PR:

- Add liquidity action.
- Remove liquidity action.
- Swap/router execution changes.
- Approval spender changes.
- Quote or slippage logic changes.
- Analytics/indexer integration.

## Recommended Next Steps

1. Add read-only External Stable Pools UI.
2. Add external add-liquidity links only after XyloNet pool ABI/source and write function signatures are verified.
3. Design a future native `CocoStablePoolV1` contract separately, using XyloNet observations as input rather than depending on XyloNet execution logic.
