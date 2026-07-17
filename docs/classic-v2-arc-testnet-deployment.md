# Classic Coco V2: Arc Testnet deployment runbook

Scope: updated classic `CocoFactory` and `CocoRouter` on Arc Testnet (chain ID `5042002`) only.

Out of scope: production/mainnet deployment, Stable Pool changes, indexer/analytics changes, quote-routing changes, and frontend address changes.

This runbook prepares a manual deployment. Nothing in this repository broadcasts automatically, and the npm scripts intentionally expose only dry-run, record, and read-only verification commands.

## Existing deployment model and preserved addresses

The original Foundry script is `contracts/script/Deploy.s.sol`. It deploys a factory, deploys a router with that factory constructor argument, then creates the Arc USDC/EURC pair. This runbook retains that model and uses the existing Arc Testnet ERC-20 contracts rather than deploying unrestricted mock tokens:

- USDC: `0x3600000000000000000000000000000000000000`
- EURC: `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a`

The current classic addresses in `src/config/contracts.ts` remain unchanged:

- old factory: `0xE1E39F01207cD3f56d3b2a69B757cf2b59c8e5bE`
- old router: `0xC31166847A4CEC31629a0ABe4E6383B3CD75732A`
- old USDC/EURC pair: `0x0eEA9DC9153215B15b1E6c43f4D68779002d4F1c`

Do not delete or overwrite these addresses or their historical records.

## Required environment variables

Set secrets in the shell or an ignored `.env` file; never commit them.

```bash
export ARC_TESTNET_RPC_URL="https://rpc.testnet.arc.network"
export ARC_TESTNET_DEPLOYER_PRIVATE_KEY="0x..."
export ARC_TESTNET_EXPECTED_DEPLOYER="0x..." # independently confirmed operator address
```

Optional configuration:

```bash
# Defaults to the deployer derived from the private key.
export ARC_TESTNET_FEE_TO_SETTER="0x..."

# Defaults to Arc Testnet USDC/EURC. Override only with reviewed Arc Testnet token contracts.
export ARC_TESTNET_TOKEN_A="0x3600000000000000000000000000000000000000"
export ARC_TESTNET_TOKEN_B="0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a"

# Resume/reuse controls. Omit these for a fresh deployment.
export ARC_TESTNET_FACTORY_ADDRESS="0x..."
export ARC_TESTNET_ROUTER_ADDRESS="0x..."

# Optional canonical-record path.
export ARC_TESTNET_DEPLOYMENT_FILE="./contracts/deployments/classic-v2-arc-testnet.json"
```

Idempotency is explicit and safe:

- Supplying `ARC_TESTNET_FACTORY_ADDRESS` reuses that factory only if it is a contract and its `feeToSetter` equals the configured value.
- Supplying `ARC_TESTNET_ROUTER_ADDRESS` reuses that router only if its immutable `factory()` equals the selected factory.
- The pair is created only when `getPair(tokenA, tokenB)` is zero; otherwise the existing pair is reused.
- Pair mappings in both orders and the CREATE2-derived address are validated.

If a partial broadcast fails, set the successfully deployed addresses from the receipts before rerunning. Do not use an old router with a new factory.

## Pre-deployment checks

From `contracts/`:

```bash
forge fmt --check
forge build
forge test -vvv
```

From the repository root:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run contracts:test:deployment-recorder
git diff --check
```

Review the working tree and confirm it contains no secrets or production-address changes.

## Exact manual deployment commands

Deployment is deliberately split into factory, router, and pair phases. This makes retries idempotent: after each successful phase, export the confirmed address before running the next phase. A rerun with that address validates and reuses the contract without broadcasting another deployment.

### 1. Phase-by-phase simulation and manual deployment

Each phase after the factory depends on a confirmed address containing live Arc Testnet bytecode. Therefore, dry-run and manually broadcast one phase before moving to the next; a simulated deployment address is not sufficient input for the next phase.

```bash
# Repository root: simulate factory.
npm run contracts:deploy:classic-v2:factory:dry

# Operator-only after reviewing the factory simulation.
cd contracts
forge script script/DeployArcClassicV2Factory.s.sol:DeployArcClassicV2Factory \
  --rpc-url "$ARC_TESTNET_RPC_URL" --broadcast -vvvv
export ARC_TESTNET_FACTORY_ADDRESS="0x..." # from the confirmed receipt
cd ..

# Simulate router against the confirmed factory.
npm run contracts:deploy:classic-v2:router:dry

# Operator-only after reviewing the router simulation.
cd contracts
forge script script/DeployArcClassicV2Router.s.sol:DeployArcClassicV2Router \
  --rpc-url "$ARC_TESTNET_RPC_URL" --broadcast -vvvv
export ARC_TESTNET_ROUTER_ADDRESS="0x..." # from the confirmed receipt
cd ..

# Simulate pair creation against the confirmed factory and router.
npm run contracts:deploy:classic-v2:pair:dry

# Operator-only after reviewing the pair simulation.
cd contracts
forge script script/CreateArcClassicV2Pair.s.sol:CreateArcClassicV2Pair \
  --rpc-url "$ARC_TESTNET_RPC_URL" --broadcast -vvvv
cd ..
```

All phases safely emit no transaction when their confirmed address is supplied (or, for the pair, when it already exists). If a phase fails, inspect its receipt before retrying. Resume from the first incomplete phase using confirmed addresses. Preserve or archive each successful phase's original broadcast artifact before a no-op rerun; the canonical recorder needs those original transaction receipts. Simulations have no canonical receipts and create no deployment record.

`--broadcast` is deliberately absent from `package.json`. Contract-source verification, if desired, is a separate operator action after deployment; it is not a security audit.

## Record transaction hashes and block numbers

Successful broadcasts write three artifacts:

- `contracts/broadcast/DeployArcClassicV2Factory.s.sol/5042002/run-latest.json`
- `contracts/broadcast/DeployArcClassicV2Router.s.sol/5042002/run-latest.json`
- `contracts/broadcast/CreateArcClassicV2Pair.s.sol/5042002/run-latest.json`

From the repository root, convert the artifacts into the canonical deployment record. Keep
`ARC_TESTNET_FEE_TO_SETTER`, `ARC_TESTNET_TOKEN_A`, and `ARC_TESTNET_TOKEN_B` set when you
overrode their defaults during deployment:

```bash
npm run contracts:record:classic-v2
```

Recording performs read-only live RPC verification of chain ID, transaction input,
sender, successful receipts, block numbers, deployed addresses, and runtime bytecode.
It never signs or broadcasts a transaction. Export the recorded code hashes before
running the read-only verifier:

```bash
export ARC_TESTNET_FACTORY_CODE_HASH="0x..."
export ARC_TESTNET_ROUTER_CODE_HASH="0x..."
export ARC_TESTNET_PAIR_CODE_HASH="0x..."
```

The recorder refuses to overwrite an existing deployment record. Archive old records instead of deleting them. The resulting JSON includes:

- chain ID
- deployer and fee-to setter addresses
- factory, router, token, and pair addresses
- factory/router deployment and pair-creation transaction hashes
- their receipt block numbers
- pair init-code hash
- factory, router, and pair runtime code hashes
- ABI-encoded factory and router constructor arguments
- `null` pair-creation transaction when the pair was already present
- source broadcast artifact paths

Check the receipt data directly before committing the record:

```bash
for artifact in \
  contracts/broadcast/DeployArcClassicV2Factory.s.sol/5042002/run-latest.json \
  contracts/broadcast/DeployArcClassicV2Router.s.sol/5042002/run-latest.json \
  contracts/broadcast/CreateArcClassicV2Pair.s.sol/5042002/run-latest.json
do
  jq '.transactions[] | {contractName, function, hash}' "$artifact"
  jq '.receipts[] | {transactionHash, blockNumber, status}' "$artifact"
done
```

## Post-deployment verification

### Read-only checks against Arc Testnet

Set the deployed addresses and run:

```bash
export ARC_TESTNET_FACTORY_ADDRESS="0x..."
export ARC_TESTNET_ROUTER_ADDRESS="0x..."
export ARC_TESTNET_FEE_TO_SETTER="0x..."
export ARC_TESTNET_TOKEN_A="0x3600000000000000000000000000000000000000"
export ARC_TESTNET_TOKEN_B="0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a"
npm run contracts:verify:classic-v2
```

This script never broadcasts. It verifies:

- factory and router contain code
- `factory.feeToSetter()` matches the expected address
- `router.factory()` matches the new factory
- `getPair` returns the same nonzero pair in both token orders
- the pair matches the current `CocoPair` CREATE2 init-code hash

### Functional checks on an isolated fork

The default test suite deploys fresh contracts locally. To exercise the deployed factory/router bytecode and state without sending Arc Testnet transactions:

```bash
cd contracts
ARC_TESTNET_VERIFY_FORK=true forge test \
  --match-contract ArcClassicV2TestnetVerification \
  --fork-url "$ARC_TESTNET_RPC_URL" \
  -vvv
```

The test creates disposable verification tokens only inside the local fork and checks:

- [ ] factory fee-to setter is correct
- [ ] router factory is correct
- [ ] `createPair` succeeds
- [ ] `getPair` works in both token orders
- [ ] first `addLiquidity` through the new router succeeds
- [ ] exact-input swap succeeds
- [ ] `removeLiquidity` succeeds
- [ ] invalid inputs revert as expected

Because these state-changing checks run on a local fork, they do not consume real Arc Testnet balances or mutate live contracts.

## Pair init-code hash and constructor arguments

The script computes the pair init-code hash from the exact compiled creation bytecode:

```solidity
keccak256(type(CocoPair).creationCode)
```

Constructor arguments recorded in the canonical deployment record are:

- `CocoFactory`: `abi.encode(feeToSetter)`
- `CocoRouter`: `abi.encode(factory)`

Any `CocoPair` source/compiler-setting change alters the init-code hash and deterministic pair addresses. Re-run all checks after such a change.

## Migration plan

1. Old contracts remain live and unchanged; deploying V2 is additive.
2. Liquidity does not migrate automatically. There is no privileged migration transaction.
3. Test LP holders withdraw from the old router/pair using the old frontend configuration or direct contract call.
4. After confirming receipt of both underlying test tokens, holders approve the new router and add liquidity to the new pair.
5. Use conservative minimum amounts and deadlines; verify token ordering and decimals before signing.
6. Update frontend factory/router/pair addresses later in a separate reviewed PR. This deployment PR does not modify `src/config/contracts.ts`.
7. Preserve old addresses and deployment start/end blocks in historical indexer configuration. A later indexer change may add the new deployment while retaining the old source; do not repoint historical data to the new contracts.

## Rollback

The contracts are immutable and an on-chain deployment cannot be deleted. Rollback means routing users back to the preserved old deployment:

1. Stop the frontend-address rollout or revert its separate PR.
2. Restore/preserve the old factory, router, and pair addresses in frontend configuration.
3. Stop adding test liquidity to the new pair.
4. Withdraw any test liquidity already added to the new pair and re-add it to the old pair if required.
5. Keep the new deployment record, transaction hashes, and block numbers archived and label the deployment inactive; never delete history.
6. Ensure historical indexing continues to associate old events with old addresses. If new-address indexing was enabled, stop at a recorded block rather than rewriting historical rows.

## Safety checklist

- [ ] Arc Testnet chain ID is exactly `5042002`
- [ ] dry run reviewed before any manual broadcast
- [ ] deployer and fee-to setter independently confirmed
- [ ] no production address or Stable Pool file changed
- [ ] no private key, RPC credential, `.env`, or broadcast artifact committed
- [ ] old deployment records preserved
- [ ] canonical record generated from actual receipts only after broadcast
- [ ] frontend update remains a separate PR
- [ ] no audit claim is made
