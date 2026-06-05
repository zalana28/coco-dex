# CocoStablePool V1 Deployment Runbook

## Status

CocoStablePool V1 is not deployed yet. The current tooling is for a future Arc Testnet deployment only. The prototype is unaudited, testnet-only, and not connected to the frontend, router, analytics, or indexer.

## Prerequisites

- Foundry installed locally.
- Arc Testnet RPC endpoint.
- Deployer wallet funded with Arc Testnet gas token.
- USDC and EURC token addresses verified before deployment.
- Local environment variables configured outside version control.

## Environment Variables

Required for deployment simulation and broadcast:

```bash
export ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.network
export COCO_DEPLOYER_PRIVATE_KEY=<local-testnet-private-key>
export COCO_STABLE_TOKEN0=0x3600000000000000000000000000000000000000
export COCO_STABLE_TOKEN1=0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a
export COCO_STABLE_FEE_BPS=4
export COCO_STABLE_A=100
export COCO_STABLE_OWNER=<owner-address>
```

`COCO_STABLE_OWNER` may be omitted for a local dry-run. If it is missing or zero, the deploy script defaults owner to the deployer and prints that choice. For a real broadcast, set the intended owner explicitly.

`COCO_DEPLOYER_PRIVATE_KEY` must only live in local shell environment, local secret storage, or secure CI secrets. Do not commit private keys.

## Dry Run

Run without `--broadcast` to simulate deployment:

```bash
cd contracts
forge script script/DeployCocoStablePool.s.sol:DeployCocoStablePool --rpc-url $ARC_TESTNET_RPC_URL
```

From the repo root:

```bash
npm run contracts:deploy:stable:dry
```

The dry-run prints the deployer, chain id, token addresses, fee, amplification parameter, owner, simulated pool address, and simulated LP token address. It does not write addresses to source files.

## Broadcast

Only when ready:

```bash
cd contracts
forge script script/DeployCocoStablePool.s.sol:DeployCocoStablePool \
  --rpc-url $ARC_TESTNET_RPC_URL \
  --broadcast
```

Do not broadcast from a wallet containing mainnet funds. This deployment path is Arc Testnet only.

## Read-Only Inspection

After a future deployment, inspect a pool without making writes:

```bash
export COCO_STABLE_POOL=<deployed-pool-address>
cd contracts
forge script script/InspectCocoStablePool.s.sol:InspectCocoStablePool --rpc-url $ARC_TESTNET_RPC_URL
```

The inspector reads token addresses, LP token, balances, fee, amplification parameter, paused state, and total LP supply.

## Post-Deploy Checklist

- Save the pool address privately first.
- Verify the contract on Arcscan if possible.
- Run read-only inspection.
- Confirm `token0`, `token1`, `lpToken`, `feeBps`, `amplificationParameter`, balances, and paused state.
- Do not update frontend config until deployment is validated.
- Do not add liquidity until contract checks pass.
- Do not update router, analytics, or indexer until ABI/events and operational checks are finalized.
- Publish addresses in docs only after validation and review.

## Safety Notes

- Testnet only.
- Unaudited prototype.
- Do not use mainnet funds.
- Do not commit private keys.
- Do not commit `.env.local`.
- Do not add frontend ABI/address exports in the deployment PR.
- Do not market as production-ready or mainnet-ready.
