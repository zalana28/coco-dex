# Coco Classic V2 Arc Testnet Deployment Runbook

> **Scope:** Arc Testnet only.  
> **Not in scope:** production/mainnet deployment, Stable Pool, indexer, analytics, or quote-routing changes.

## Purpose

This document describes how to manually deploy the updated classic Coco V2 contracts (`CocoFactory`, `CocoRouter`) to Arc Testnet, verify them, and migrate test liquidity without affecting the existing classic V1 or Stable Pool deployments.

## Pre-requisites

- Git repository at `https://github.com/zalana28/coco-dex`
- Branch `chore/classic-v2-testnet-deployment-plan` checked out
- Foundry installed (`forge --version`)
- Node.js 22+ and npm installed
- An Arc Testnet wallet with gas USDC (native gas token on Arc Testnet)
- RPC URL for Arc Testnet

## Environment variables

Create or update `.env` in the repository root (this file is already `.gitignore`d):

```bash
# Required
export ARC_TESTNET_RPC_URL="https://rpc.testnet.arc.network"
export ARC_TESTNET_DEPLOYER_PRIVATE_KEY="0x..."

# Optional
export ARC_TESTNET_FEE_TO_SETTER="0x..."        # defaults to deployer
export ARC_TESTNET_FACTORY_ADDRESS="0x..."      # re-use an existing factory
export ARC_TESTNET_ROUTER_ADDRESS="0x..."       # re-use an existing router
export ARC_TESTNET_MOCK_TOKEN_A="0x..."        # re-use an existing mock token
export ARC_TESTNET_MOCK_TOKEN_B="0x..."        # re-use an existing mock token
export ARC_TESTNET_OUTPUT_FILE="./deployments/classic-v2-arc-testnet.json"
```

Never commit private keys or RPC credentials.

## Manual deployment command

Dry run (simulation only, no transaction broadcast):

```bash
cd contracts
forge script script/ArcClassicV2TestnetDeployment.s.sol:ArcClassicV2TestnetDeployment \
  --rpc-url $ARC_TESTNET_RPC_URL \
  -vvvv
```

Live deployment (operator must review the simulation output before signing):

```bash
cd contracts
forge script script/ArcClassicV2TestnetDeployment.s.sol:ArcClassicV2TestnetDeployment \
  --rpc-url $ARC_TESTNET_RPC_URL \
  --broadcast \
  --verify \
  --verifier-url https://testnet.arcscan.app/api \
  -vvvv
```

Or from the repository root:

```bash
npm run contracts:deploy:classic-v2:dry   # simulation
npm run contracts:deploy:classic-v2     # live broadcast + verify
```

The script:

1. Checks `block.chainid == 5042002` (Arc Testnet).
2. Deploys `CocoFactory` with `feeToSetter` (or re-uses `ARC_TESTNET_FACTORY_ADDRESS`).
3. Deploys `CocoRouter` with the factory address (or re-uses `ARC_TESTNET_ROUTER_ADDRESS`).
4. Deploys two mock ERC-20 tokens (or re-uses provided addresses).
5. Creates a single pair from the two mock tokens if it does not exist.
6. Validates the pair address against the deterministic CREATE2 formula.
7. Writes a JSON deployment record to `./deployments/classic-v2-arc-testnet.json`.

## Expected outputs

The deployment record contains:

| Field | Description |
|-------|-------------|
| `chainId` | `5042002` |
| `deployer` | Address that sent the transactions |
| `feeToSetter` | Address set as `CocoFactory.feeToSetter` |
| `factory` | Deployed `CocoFactory` address |
| `router` | Deployed `CocoRouter` address |
| `mockTokenA` | Mock ERC-20 A address |
| `mockTokenB` | Mock ERC-20 B address |
| `pair` | First created pair address |
| `pairInitCodeHash` | `keccak256` of `CocoPair` creation bytecode |
| `factoryBlock` / `routerBlock` / `createPairBlock` | Block numbers of each step |
| `constructorArgsFactory` | ABI-encoded `feeToSetter` |
| `constructorArgsRouter` | ABI-encoded factory address |
| `note` | Arc Testnet-only disclaimer |

The canonical transaction hashes are emitted as `ClassicV2Deployed` events and are also recorded in the Foundry broadcast artifact at `broadcast/run-latest.json` (or `broadcast/<chain_id>/run-latest.json`). Extract them with:

```bash
cat contracts/broadcast/run-latest.json | jq '.transactions[] | {name, txHash, contractName, contractAddress}'
```

## Verification checklist

Run the offline verification suite before any live broadcast:

```bash
cd contracts
forge test --match-contract ArcClassicV2TestnetVerification -vvv
```

This validates:

- [ ] `factory.feeToSetter == deployer` (or configured `ARC_TESTNET_FEE_TO_SETTER`)
- [ ] `router.factory == factory`
- [ ] `factory.createPair` succeeds
- [ ] `factory.getPair` returns the same address in both token orders
- [ ] First `router.addLiquidity` succeeds
- [ ] `router.swapExactTokensForTokens` succeeds
- [ ] `router.removeLiquidity` succeeds
- [ ] Invalid inputs still revert with expected errors (`CocoRouter: EXPIRED`, `CocoRouter: INVALID_TO`, `CocoRouter: INVALID_PATH`, `CocoRouter: INSUFFICIENT_INPUT_AMOUNT`, `CocoRouter: INSUFFICIENT_LIQUIDITY`, `CocoLibrary: PAIR_NOT_FOUND`, etc.)

After a live deployment, validate the on-chain state with:

```bash
cast call <FACTORY> "feeToSetter()(address)" --rpc-url $ARC_TESTNET_RPC_URL
cast call <ROUTER> "factory()(address)" --rpc-url $ARC_TESTNET_RPC_URL
cast call <FACTORY> "getPair(address,address)(address)" <TOKEN_A> <TOKEN_B> --rpc-url $ARC_TESTNET_RPC_URL
```

## Migration and liquidity notes

- **Old contracts remain live and unchanged.** The existing `FACTORY_ADDRESS`, `ROUTER_ADDRESS`, and `USDC_EURC_PAIR_ADDRESS` in `src/config/contracts.ts` are not modified by this script.
- **Liquidity does not migrate automatically.** Existing LP holders must manually withdraw from the old router and re-add liquidity through the new router.
- **Test liquidity only.** The new deployment mints fresh mock tokens for verification. Real testnet liquidity (e.g., USDC/EURC) must be added separately through the new router if needed.
- **Frontend address update.** The frontend will be pointed to the new addresses in a separate PR. Do not update `src/config/contracts.ts` in this deployment PR.
- **Historical indexing.** Keep the old deployment record (e.g., `src/config/contracts.ts` and any prior JSON files) intact for historical indexing and reference.

## Rollback procedure

Because the deployment is additive and does not modify existing contracts, rollback is a configuration change rather than a contract migration:

1. Do not broadcast any transactions to the old contracts.
2. Revert the frontend PR that points to the new factory/router addresses.
3. Re-activate the old contract addresses in `src/config/contracts.ts`.
4. Archive the new deployment JSON under `deployments/archive/<date>-classic-v2-arc-testnet.json`.

## Safety rules

- Do not run the deployment script in CI or any automated pipeline with `--broadcast`.
- Do not commit `.env`, private keys, or RPC URLs.
- Do not claim the contracts are audited in any documentation or communications.
- Do not delete old deployment records.
- Do not modify Stable Pool, indexer, analytics, or quote-routing code as part of this task.

## Pair init code hash

The deterministic pair address depends on the compiled `CocoPair` creation bytecode. The deployment script computes this at runtime with:

```solidity
keccak256(type(CocoPair).creationCode)
```

If the source changes, the hash changes, and all previously computed pair addresses become invalid. Re-verify the hash after any contract modification.

## Constructor arguments

- `CocoFactory`: `abi.encode(feeToSetter)` — one address.
- `CocoRouter`: `abi.encode(factory)` — one address.

These are recorded in the deployment JSON for verification on the block explorer.

## Related files

- `contracts/script/ArcClassicV2TestnetDeployment.s.sol`
- `contracts/test/ArcClassicV2TestnetVerification.t.sol`
- `contracts/foundry.toml`
- `deployments/classic-v2-arc-testnet.json` (generated after broadcast)
- `src/config/contracts.ts` (unchanged; old addresses preserved)
