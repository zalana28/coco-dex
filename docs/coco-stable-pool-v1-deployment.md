# CocoStablePool V1 Deployment Runbook

## Status

CocoStablePool V1 has a prototype deployment on Arc Testnet for verification. The prototype is unaudited, testnet-only, has no liquidity yet, and is not connected to the frontend, router, analytics, or indexer.

Initial liquidity tooling exists in `contracts/script/AddInitialLiquidityCocoStablePool.s.sol`, but no liquidity has been added yet unless a maintainer manually runs the script with `--broadcast` later. Frontend, router, analytics, and indexer integration remain out of scope.

## Arc Testnet Deployment Record

CocoStablePool V1 was deployed on Arc Testnet for prototype verification. It is not audited, has no liquidity yet, is not connected to the frontend or router, is not connected to analytics or the indexer, and must be treated as testnet-only.

### Deployment

| Field | Value |
| --- | --- |
| Deployment status | Deployed on Arc Testnet |
| Chain ID | `5042002` |
| Tx hash | `0x6be87f49ae343f4fc36a72408ba84c18dbe6fa670d2ee0712c207a51557385f1` |
| Block | `45646084` |
| CocoStablePool address | `0x0EA7A79F8864091ac7F2B8643BaA7598a9d05a83` |
| CocoStableLP address | `0xfE4A959c689019E09f584F25114Bb5A5e2aA8499` |
| Token0 USDC | `0x3600000000000000000000000000000000000000` |
| Token1 EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| Fee bps | `4` |
| Amplification parameter | `100` |
| Owner | `0x42b10b337A5692743D587134c89A725422c3dFFB` |
| Gas paid | `0.039320113378283604 USDC` |

### Inspection

| Field | Value |
| --- | --- |
| Balance0 | `0` |
| Balance1 | `0` |
| Total LP supply | `0` |
| Paused | `false` |

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

Inspect a deployed pool without making writes:

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
- Use `docs/coco-stable-pool-v1-initial-liquidity.md` for dry-run-first initial liquidity guidance.
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
