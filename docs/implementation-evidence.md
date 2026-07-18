# Public Implementation Evidence

Snapshot recorded for branch `chore/public-proof-security-compliance` before implementation changes.

## Starting repository state

- Repository: `https://github.com/zalana28/coco-dex`
- Starting `origin/main` commit: `dc2b796414735d2a36082f69fc528f3a2843a56d`
- Application version: `0.1.0`
- Arc Testnet EVM chain ID: `5042002`
- Arc CCTP domain: `26` (a different identifier and type from the EVM chain ID)

## Bridge implementation present on starting main

- `@circle-fin/bridge-kit`: exact lockfile version `1.12.1`
- `@circle-fin/adapter-viem-v2`: exact lockfile version `1.14.0`
- `BridgePage`: `src/pages/BridgePage.tsx`
- route: `/bridge` in `src/App.tsx`
- navigation: Bridge item in `src/components/layout/Header.tsx`
- responsive Bridge fixes: main commit `f7f7f7d` (PR #91)
- accessibility fixes: main commit `6f1057b` (PR #92)
- recovery: `bridgeFacade.retryBridge` uses the recorded Bridge Kit result with a fresh adapter; a successful recorded burn is not repeated

No Bridge behavior is reimplemented or refactored by the public-proof PR.

## Active public application routes

- `/`
- `/swap`
- `/bridge`
- `/pools`
- `/pools/add`
- `/pools/remove`
- `/analytics`
- `/docs`
- fallback `*`

The public-proof change adds `/terms` and `/privacy` as owner-review-required templates. No authentication/session gate is introduced.

## Addresses currently configured by app/indexer

| Component | Address |
|---|---|
| Coco Classic V2 Factory | `0xE1E39F01207cD3f56d3b2a69B757cf2b59c8e5bE` |
| Coco Classic V2 Router | `0xC31166847A4CEC31629a0ABe4E6383B3CD75732A` |
| Coco Classic V2 USDC/EURC Pair | `0x0eEA9DC9153215B15b1E6c43f4D68779002d4F1c` |
| ERC-20 USDC | `0x3600000000000000000000000000000000000000` |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| Coco Stable Pool LP Beta | `0x0EA7A79F8864091ac7F2B8643BaA7598a9d05a83` |
| Stable LP token | `0xfE4A959c689019E09f584F25114Bb5A5e2aA8499` |

`contracts/deployments/classic-v2-arc-testnet.json` records another newer deployment. It is not activated in the current frontend/indexer configuration. This evidence document does not designate or perform an address migration.

## Bridge routes and units

- Ethereum Sepolia USDC (`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`) → Arc Testnet
- Base Sepolia USDC (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`) → Arc Testnet
- CCTP V2 only
- Circle Bridge Kit and Forwarding Service
- EURC is not offered by the Bridge page
- ERC-20 USDC app transfers/approvals: 6-decimal units
- native Arc gas accounting: 18-decimal raw EVM units
- no Circle API key required for browser-wallet Bridge execution
- `/api/circle/health`: optional server/admin diagnostic only

## Scope exclusions

This snapshot and PR do not modify Bridge/CCTP execution or recovery, swap mathematics, route selection, smart contracts, deployed addresses, wallet connection logic, or indexer event-processing behavior.
