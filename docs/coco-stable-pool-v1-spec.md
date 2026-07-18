# CocoStablePool V1 Specification

## Overview

CocoStablePool V1 is a planned native stablecoin AMM for Coco DEX on Arc Testnet. The initial target pair is USDC/EURC.

The goal is to offer lower-slippage stablecoin swaps than a basic constant-product pool when assets are trading close to their expected range. V1 is Arc Testnet only. It is not audited and must not be marketed as production-ready.

## LP Beta Status

CocoStablePool V1 is live as an Arc Testnet LP Beta. Initial tiny liquidity has been added, basic quote checks passed for both USDC -> EURC and EURC -> USDC, and the Pools page supports tested Add Liquidity and Remove Liquidity UI flows. The pool is not used by the router, is indexed only through separate beta observability, remains unaudited, is not production-ready, and is Arc Testnet only. The implementation uses simplified stable-swap-inspired math and still needs deeper review, fuzzing, invariant testing, and integration planning before any broader use.

## Current On-Chain Status

- Deployed on Arc Testnet at `0x0EA7A79F8864091ac7F2B8643BaA7598a9d05a83`.
- Initial tiny liquidity has been added for verification.
- Post-liquidity inspection shows `1000000` raw units of USDC, `1000000` raw units of EURC, total LP supply `1000000`, and `paused = false`.
- Quote checks passed for `100000` raw input in both directions, returning `99860` raw output.
- A read-only Pools page panel displays the pool for visibility.
- Testnet-only Add Liquidity and Remove Liquidity UI flows have been added and tested for the Pools page beta flow.
- Add liquidity uses separate exact USDC and EURC approvals before calling `addLiquidity`.
- Remove liquidity burns cSLP through `removeLiquidity` and does not require LP approval.
- Remove liquidity derives minimum outputs from expected proportional output with the selected slippage tolerance.
- The frontend reads cSLP decimals dynamically from the LP token and falls back to 18 decimals.
- Transaction progress and RPC rate-limit handling have been added for the Add Liquidity and Remove Liquidity flows.
- The pool is marked LP Beta on Arc Testnet.
- Quote-only router readiness diagnostics are available through `npm run debug:coco-stable-quote`.
- The pool remains unaudited and not production-ready.
- Router integration remains future work.
- The pool is not integrated into router or swap execution. Its beta observability is indexed separately from classic Coco V2 analytics.

## Router Readiness Diagnostics

CocoStablePool V1 now has a read-only quote diagnostic script for router readiness research. Run `npm run debug:coco-stable-quote` with `ARC_TESTNET_RPC_URL` configured to read pool tokens, reserves, LP supply, fee, amplification, paused state, and `getAmountOut` results for USDC -> EURC and EURC -> USDC sample inputs.

This diagnostic is quote-only. It never approves tokens, calls `swap`, broadcasts transactions, or enables the pool as a smart router source. The current pool liquidity is intentionally tiny, so quotes are useful for sanity checks and comparison only. They must not be treated as production readiness.

Future router execution work must remain gated by:

- quote-only comparison against existing routes first;
- small maximum input caps;
- slippage and minimum-output guards;
- a pool liquidity threshold before route eligibility;
- an explicit disable flag that defaults to disabled;
- Arc Testnet manual execution tests before any broader rollout.

## Fuzz and Invariant Testing Status

Fuzz tests and invariant tests have been added for the CocoStablePool V1 prototype. They cover liquidity operations, swaps, round-trip behavior, quote safety, LP accounting, pool balance accounting, fee bounds, and paused-state write blocking. This does not make the prototype audited or production-ready. The Arc Testnet deployment is still not connected to router execution, and the production math still needs deeper review before any broader integration.

## Deployment Tooling Status

Local Foundry deployment tooling exists for Arc Testnet prototype deployment and inspection. Frontend/router integration remains a later phase after deployment validation.

## Why Coco Needs a Native Stable Pool

Coco DEX already compares routes across Coco, XyloNet, UnitFlow, and Synthra. A native Coco stable pool would let Coco own part of the liquidity layer instead of only routing to external pools.

Stable pools are useful for assets intended to trade near parity or within a narrow range. USDC/EURC can still move because of FX rates, issuer risk, market conditions, and possible depeg events, so Coco documentation and UI must not claim guaranteed 1:1 pricing.

## Stable Pool vs Constant Product AMM

A constant-product AMM uses `x * y = k` style behavior. It is simple and well understood, but swaps can create meaningful slippage even when two assets are expected to trade close together.

A stable pool AMM uses a stable-swap style invariant designed for lower slippage around balanced stable assets. Stable-swap designs commonly use an amplification parameter `A`, which conceptually makes the pool behave closer to constant-sum near balance and closer to constant-product under imbalance.

For V1, Coco should implement only a simple two-token stable pool. The implementation must not copy Curve code blindly. It should be small, tested, and testnet-only until it has passed deeper review.

## V1 Design Goals

- USDC/EURC only in V1.
- Fixed token pair.
- Fixed or governance-controlled fee with strict bounds.
- Suggested swap fee: 0.04% or 0.05%.
- ERC20 LP token for liquidity providers.
- Add liquidity.
- Remove liquidity.
- Swap.
- Read-only quote function.
- Reserves or balances view.
- No gauges.
- No farming rewards.
- No flash loans.
- No multi-pool factory.
- No upgradeable proxy in V1 unless explicitly justified.
- No arbitrary token support.

## Planned Contracts

### CocoStablePool

`CocoStablePool` owns the USDC/EURC reserves. It handles add liquidity, remove liquidity, swaps, quote calculations, balance views, and event emission.

The pool should be the only contract allowed to mint or burn its LP token. It should keep token support fixed after deployment and must not include owner functions that can drain pool reserves.

### CocoStableLP

`CocoStableLP` is an ERC20 LP token. It is minted and burned only by `CocoStablePool` and represents a proportional share of pool liquidity.

The LP token should use OpenZeppelin ERC20. The pool should own mint and burn permissions.

### CocoStableRouter

`CocoStableRouter` may be added later to wrap pool interactions for better UX. It is not required for the V1 prototype.

## Required Functions

### `addLiquidity(uint256 amount0, uint256 amount1, uint256 minLpOut, address to)`

Behavior:

- Transfers USDC and EURC from `msg.sender`.
- Mints LP tokens to `to`.
- Respects `minLpOut`.
- Rejects zero amounts.
- Handles the first deposit carefully.
- Handles imbalanced deposits carefully.
- Uses slippage checks so callers are not forced into worse-than-expected LP minting.

The first deposit should define the initial pool balance without allowing dust or invalid LP supply. Later deposits should mint LP based on pool value and must account for imbalance and rounding.

### `removeLiquidity(uint256 lpAmount, uint256 minAmount0Out, uint256 minAmount1Out, address to)`

Behavior:

- Burns LP tokens from `msg.sender`.
- Returns proportional USDC and EURC to `to`.
- Respects `minAmount0Out` and `minAmount1Out`.
- Rejects zero LP amount.

The function must use current pool balances, avoid reserve underflow, and transfer only the caller's proportional share.

### `swap(address tokenIn, uint256 amountIn, uint256 minAmountOut, address to)`

Behavior:

- `tokenIn` must be USDC or EURC.
- `tokenOut` is the other pool token.
- Transfers `tokenIn` from `msg.sender`.
- Sends `tokenOut` to `to`.
- Respects `minAmountOut`.
- Charges swap fee.
- Updates balances safely.

The implementation must avoid arbitrary external calls except ERC20 transfers. State updates and transfer ordering should be designed with reentrancy protection.

### `getAmountOut(address tokenIn, uint256 amountIn)`

Behavior:

- Read-only quote.
- Returns expected `tokenOut` amount after fees.
- Must match swap math as closely as possible.
- Rejects unsupported `tokenIn` and zero amount.

Any rounding differences between quote and swap must be documented and covered by tests.

### Views

Required views:

- `getBalances()`
- `getTokens()`
- `lpToken()`
- `feeBps()`
- `amplificationParameter()`
- `paused()`

## Events

```solidity
event LiquidityAdded(
    address indexed provider,
    address indexed to,
    uint256 amount0,
    uint256 amount1,
    uint256 lpMinted
);

event LiquidityRemoved(
    address indexed provider,
    address indexed to,
    uint256 lpBurned,
    uint256 amount0,
    uint256 amount1
);

event Swap(
    address indexed sender,
    address indexed to,
    address indexed tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint256 amountOut,
    uint256 feeAmount
);

event FeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);
event Paused(address account);
event Unpaused(address account);
```

## Token and Decimal Handling

USDC and EURC are expected to use 6 decimals on Arc Testnet. The contract should verify decimals at construction if possible.

Internal math should normalize token balances if tokens ever differ in decimals. For V1's fixed USDC/EURC pair, decimals should still be documented explicitly and constructor validation should protect against incorrect deployments.

Avoid hardcoded assumptions unless the constructor validates them.

## Fee Policy

- Suggested default fee: 4 bps or 5 bps.
- Maximum fee cap: `<= 30 bps`.
- Fee recipient or fee-stays-in-pool design must be decided before implementation.
- If fees stay in the pool, LPs benefit through increased pool value.
- If a protocol fee exists, it must be explicit and capped.
- There must be no hidden owner withdrawal of pool reserves.

V1 should prefer the smallest fee policy that is easy to reason about and easy to test.

## Security Requirements

- Use OpenZeppelin ERC20 for the LP token.
- Use OpenZeppelin SafeERC20 for token transfers.
- Use ReentrancyGuard on state-changing functions.
- Consider Pausable for emergency stop.
- Use a fixed token allowlist only.
- No arbitrary external calls except ERC20 transfers.
- No owner withdrawal of pool reserves.
- No unrestricted `rescueTokens` for pool assets.
- `rescueTokens` may only recover non-pool tokens if implemented.
- Slippage protections are required for add, remove, and swap.
- Strict input validation is required.
- Invariant and rounding tests are required before deployment.

## Admin and Governance Controls

V1 should keep admin controls minimal:

- Owner can pause and unpause.
- Owner may update fee only within a strict cap.
- Owner cannot drain funds.
- Owner cannot change pool tokens.
- Owner cannot change LP balances.
- Owner cannot mint arbitrary LP except through pool accounting.
- Ownership transfer may be supported.

Any governance control that changes economics must be documented before deployment.

## Test Plan

### Contract Deployment

- Deploy with correct tokens.
- Reject same token.
- Reject zero addresses.
- Verify token decimals.

### Add Liquidity

- First balanced deposit.
- Second balanced deposit.
- Imbalanced deposit.
- `minLpOut` too high reverts.
- Zero amount reverts.
- Insufficient allowance reverts.
- Insufficient balance reverts.

### Remove Liquidity

- Full remove.
- Partial remove.
- Minimum outputs too high revert.
- Zero LP amount reverts.
- Remove without LP reverts.

### Swap

- USDC to EURC.
- EURC to USDC.
- `amountOut` respects `minAmountOut`.
- Zero amount reverts.
- Unsupported token reverts.
- Insufficient balance reverts.
- Insufficient allowance reverts.
- Large swap price impact.
- Repeated swaps do not break accounting.
- Fee is charged correctly.

### Math and Invariant

- Quote and swap output consistency.
- Balanced pool low-slippage behavior.
- Imbalanced pool behavior.
- Rounding edge cases.
- Fuzz tests if the current toolchain supports it.
- Invariant tests if the current toolchain supports it.

### Security

- Reentrancy attempt.
- Pause blocks add, remove, and swap.
- Owner cannot withdraw pool tokens.
- `rescueTokens` cannot rescue USDC or EURC.
- Fee update respects cap.

### Integration

- Frontend quote can read `getAmountOut`.
- Frontend can read balances.
- Indexer can parse events.
- Analytics can calculate TVL and volume from events.

## Frontend Integration Plan

Future phases:

1. Deploy contract on Arc Testnet.
2. Add read-only pool card in Pools page.
3. Add add liquidity UI.
4. Add remove liquidity UI.
5. Add CocoStablePool as route source in smart router.
6. Add route comparison with Coco stable pool.
7. Add transaction progress labels.
8. Add docs and warnings.

No frontend route behavior should change until the contract address, ABI, quote math, and safety warnings are finalized.

## Indexer and Analytics Plan

Future phases:

- Index `LiquidityAdded`.
- Index `LiquidityRemoved`.
- Index `Swap`.
- Track stable pool TVL.
- Track volume.
- Track fees.
- Track LP events.
- Expose analytics summary.
- Do not change current analytics until contract ABI and events are finalized.

## Deployment Plan

- Arc Testnet only.
- Use small initial liquidity.
- Verify contract on Arcscan if possible.
- Publish addresses in docs only after deployment.
- Update `.env.example` only when integration starts.
- Do not deploy outside the reviewed Arc Testnet plan.
- Do not market as audited.

## Risk Disclosure

- Unaudited contract risk.
- Stable-swap math risk.
- Rounding risk.
- Liquidity imbalance risk.
- Depeg and FX risk for USDC/EURC.
- LP loss.
- Smart contract exploit risk.
- External dependency risk.
- Testnet-only status.

## Recommended Implementation Phases

1. Phase 1: spec.
2. Phase 2: prototype contracts and unit tests.
3. Phase 3: local deployment script.
4. Phase 4: Arc Testnet deployment.
5. Phase 5: read-only frontend.
6. Phase 6: add/remove liquidity UI.
7. Phase 7: smart router integration.
8. Phase 8: analytics/indexer integration.
9. Phase 9: security review.
