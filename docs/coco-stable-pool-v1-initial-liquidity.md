# CocoStablePool V1 Initial Liquidity

## Status

Initial liquidity tooling exists for the deployed CocoStablePool V1 Arc Testnet LP Beta. Initial liquidity has now been added manually on Arc Testnet. The pool is still unaudited, testnet-only, and not connected to the router, analytics, or indexer.

A Pools page panel displays CocoStablePool V1 metadata and on-chain state for visibility. Tested LP Beta Add Liquidity and Remove Liquidity UI flows are available for this pool on Arc Testnet. Add Liquidity uses separate exact USDC and EURC approvals before calling `addLiquidity`; Remove Liquidity burns cSLP directly through the pool contract and does not require LP token approval. These flows do not include swap, router, analytics, indexer, or production support.

## Pools Page Add Liquidity UI

The CocoStablePool V1 panel includes an Arc Testnet LP Beta Add Liquidity section for experimentation with tiny amounts.

- The UI approves exactly the entered USDC amount if the current allowance is insufficient.
- The UI approves exactly the entered EURC amount if the current allowance is insufficient.
- The UI then calls `addLiquidity(amount0, amount1, minLpOut, connectedWallet)`.
- The UI requires nonzero USDC, EURC, and minimum LP output inputs.
- The UI blocks the action when the wallet is disconnected, on the wrong network, the pool is paused, balances are insufficient, or allowances are still insufficient.
- There is still no swap or smart router integration.
- There is still no analytics or indexer integration.

This UI is for Arc Testnet LP Beta experimentation only. Start with tiny amounts, do not overfund the pool, and do not treat the displayed LP preview or quote checks as production readiness.

## Pools Page Remove Liquidity UI

The CocoStablePool V1 panel includes an Arc Testnet LP Beta Remove Liquidity section for tiny testnet withdrawals.

- The UI reads connected-wallet cSLP balance and current pool reserves.
- The UI accepts cSLP amount, minimum USDC out, and minimum EURC out.
- The UI includes 25%, 50%, 75%, and Max quick amount buttons.
- The UI previews proportional expected output from the contract-tested formula: `lpAmount * reserve / totalSupply`.
- The UI auto-fills minimum USDC and EURC outputs from expected output with a default 0.5% slippage buffer.
- Users can override minimum outputs manually, and impossible minimum outputs are blocked before simulation.
- The UI simulates `removeLiquidity(lpAmount, minAmount0Out, minAmount1Out, connectedWallet)` before submitting.
- The remove flow uses resilient transaction progress with receipt polling fallback, slower backoff, rate-limit-friendly copy, and Check status recovery.
- LP token approval is not required because the pool contract burns cSLP directly from `msg.sender`.
- There is still no swap or smart router integration.
- There is still no analytics or indexer integration.

This UI remains testnet-only, unaudited LP Beta functionality. Start with tiny amounts and set minimum outputs carefully.

## Add Liquidity UI Test

The Add Liquidity UI has been tested successfully on Arc Testnet after the transaction progress and RPC rate-limit hotfixes. The UI uses exact approvals for USDC and EURC before calling `addLiquidity`, and transaction progress has been hardened with receipt polling fallback and RPC rate-limit backoff.

The UI remains testnet-only and unaudited. CocoStablePool V1 is still not used by smart router routing. Remove Liquidity UI is now added for the Pools page beta flow, and router integration is not added yet.

Tx hash: not recorded in this docs update.

### Test Checklist

- Approve USDC succeeded.
- Approve EURC succeeded.
- Add Liquidity succeeded.
- Pool reserves refreshed after success.
- LP balance refreshed after success.
- Remove Liquidity UI added separately for cSLP burns.
- No router integration yet.

## Remove Liquidity UI Test

The Remove Liquidity UI has been tested successfully on Arc Testnet after the cSLP decimal and min-output hotfix. cSLP decimal formatting was fixed so 25%, 50%, 75%, and Max buttons auto-fill human-readable cSLP amounts. Min USDC and EURC outputs auto-fill from expected output with default slippage, and impossible min outputs are blocked before simulation or send.

LP approval is not required because the pool burns cSLP through the pool-controlled burn flow. The pool remains testnet-only and unaudited, and it is still not used by the smart router.

Tx hash: not recorded in this docs update.

### Remove Test Checklist

- cSLP balance displayed.
- Percent buttons worked.
- Min outputs auto-filled safely.
- Remove transaction succeeded.
- Reserves refreshed after success.
- cSLP balance refreshed after success.
- No router integration yet.
- No analytics/indexer integration yet.

## Arc Testnet Initial Liquidity Record

Initial liquidity was added to the CocoStablePool V1 Arc Testnet prototype. The seed is intentionally tiny and exists for verification only. The pool remains testnet-only, unaudited, not connected to router execution, and not connected to analytics or the indexer.

### Transaction

| Field | Value |
| --- | --- |
| Tx hash | `0x42baad68e50936d5befff7cd70f694b9feb99b3219d026eff7d39b2b4c6d242c` |
| Block | `45742380` |
| CocoStablePool | `0x0EA7A79F8864091ac7F2B8643BaA7598a9d05a83` |
| CocoStableLP | `0xfE4A959c689019E09f584F25114Bb5A5e2aA8499` |
| Token0 USDC | `0x3600000000000000000000000000000000000000` |
| Token1 EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| Amount0 added | `1000000` raw units, `1 USDC` |
| Amount1 added | `1000000` raw units, `1 EURC` |
| LP minted | `1000000` raw units |
| LP recipient | `0x42b10b337A5692743D587134c89A725422c3dFFB` |

### Post-Liquidity Inspection

| Field | Value |
| --- | --- |
| Balance0 | `1000000` |
| Balance1 | `1000000` |
| Total LP supply | `1000000` |
| Paused | `false` |
| LP holder | `0x42b10b337A5692743D587134c89A725422c3dFFB` |
| LP holder balance | `1000000` |

### Quote Checks

| Quote | Raw input | Raw output |
| --- | ---: | ---: |
| USDC -> EURC | `100000` | `99860` |
| EURC -> USDC | `100000` | `99860` |

These quotes are testnet prototype outputs. They do not imply production readiness. USDC/EURC pricing still has FX and depeg risk, and the stable pool is not yet part of Coco DEX routing.

## Deployed Contracts

| Field | Value |
| --- | --- |
| Chain ID | `5042002` |
| CocoStablePool | `0x0EA7A79F8864091ac7F2B8643BaA7598a9d05a83` |
| CocoStableLP | `0xfE4A959c689019E09f584F25114Bb5A5e2aA8499` |
| Token0 USDC | `0x3600000000000000000000000000000000000000` |
| Token1 EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| Fee bps | `4` |
| Amplification parameter | `100` |

## Prerequisites

- Foundry installed locally.
- Deployer wallet has Arc Testnet gas token.
- Deployer wallet has testnet USDC and EURC.
- `.env.local` or local shell environment is configured.
- `COCO_DEPLOYER_PRIVATE_KEY` is stored only in local secret handling and never committed.

## Environment

Amounts are raw token units. USDC and EURC use 6 decimals, so `1 USDC = 1000000`.

```bash
export ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.network
export COCO_DEPLOYER_PRIVATE_KEY=<local-testnet-private-key>
export COCO_STABLE_POOL=0x0EA7A79F8864091ac7F2B8643BaA7598a9d05a83
export COCO_STABLE_TOKEN0=0x3600000000000000000000000000000000000000
export COCO_STABLE_TOKEN1=0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a
export COCO_STABLE_INITIAL_AMOUNT0=<raw-usdc-amount>
export COCO_STABLE_INITIAL_AMOUNT1=<raw-eurc-amount>
export COCO_STABLE_MIN_LP_OUT=<raw-min-lp-out>
export COCO_STABLE_LP_RECIPIENT=<recipient-address>
```

`COCO_STABLE_LP_RECIPIENT` may be omitted for dry-run checks. If it is missing or zero, the script defaults the LP recipient to the deployer and prints that choice clearly.

## Dry Run

Run without `--broadcast` first. This simulates approvals and initial liquidity without sending transactions:

```bash
cd contracts
forge script script/AddInitialLiquidityCocoStablePool.s.sol:AddInitialLiquidityCocoStablePool --rpc-url $ARC_TESTNET_RPC_URL
```

From the repo root:

```bash
npm run contracts:stable:add-liquidity:dry
```

The dry-run validates chain id, pool address, token addresses, paused state, token balances, allowances, nonzero amounts, and a nonzero `COCO_STABLE_MIN_LP_OUT`.

## Broadcast

Only when ready, and only after reviewing the dry-run output:

```bash
cd contracts
forge script script/AddInitialLiquidityCocoStablePool.s.sol:AddInitialLiquidityCocoStablePool \
  --rpc-url $ARC_TESTNET_RPC_URL \
  --broadcast
```

There is intentionally no package broadcast alias to reduce accidental on-chain execution.

## Post-Liquidity Inspection

After a manual broadcast, inspect the pool without making writes:

```bash
export COCO_STABLE_POOL=0x0EA7A79F8864091ac7F2B8643BaA7598a9d05a83
cd contracts
forge script script/InspectCocoStablePool.s.sol:InspectCocoStablePool --rpc-url $ARC_TESTNET_RPC_URL
```

Do not connect the pool to frontend, router, analytics, or indexer before inspection confirms the resulting balances, LP supply, paused state, token addresses, fee, and amplification parameter.

## Initial Amount Guidance

- Use very small testnet amounts first.
- USDC and EURC are not guaranteed to trade exactly 1:1.
- Initial liquidity effectively sets the first pool price.
- Adding imbalanced or wrong-ratio liquidity can make the pool price wrong.
- Start with tiny amounts only and inspect immediately after broadcast.
- Do not overfund this unaudited prototype.
- Do not claim yield or production readiness.

## Risk Notes

- Testnet only.
- Unaudited prototype.
- Do not use mainnet funds.
- Do not commit private keys or `.env.local`.
- Do not commit broadcast artifacts as deployment proof.
- Do not connect frontend/router before inspection.
- Do not connect analytics/indexer before event and operational checks are finalized.
