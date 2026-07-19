# Router discovery and verification

## Purpose and scope

This system audits candidate route providers independently without changing Coco DEX runtime routing. It is discovery and verification only. It does not enable a route, produce an approval action, produce user-facing transaction calldata, request a wallet signature, broadcast a transaction, deploy a contract, add an API function, add a Cron, or change Bridge/CCTP behavior.

Providers in scope: Coco, XyloNet, UnitFlow, and Synthra on Arc Testnet chain ID `5042002`.

A quote call or simulation that succeeds is evidence only for the selected calldata, fixed block, and sender assumptions. It does **not** prove that a contract or protocol is secure, audited, production-ready, immutable, economically safe, liquid, guaranteed to execute later, or guaranteed to be included.

## Evidence hierarchy

Evidence is weighted in this order:

1. Coco canonical deployment JSON, Solidity sources, and repository tests. Compiled output under `contracts/out/` is gitignored and is not claimed as committed evidence.
2. Live Arc Testnet runtime bytecode and runtime code hash at one fixed audit block.
3. Verified Arcscan source and ABI.
4. Official provider repositories and deployment files.
5. Official provider documentation.
6. Provider frontend configuration as secondary discovery evidence only.

Marketing claims, screenshots, UI labels, blogs, generic protocol repositories, another chain's deployment, documentation alone, a single successful quote, a single `eth_call`, and arbitrary API/frontend addresses are not sufficient execution proof.

Conflicting candidates are all preserved in `src/lib/router-audit/registry.ts`. The audit never chooses one silently. Runtime evidence, verified source, constructor/immutable values, and factory/pool/router relationships must resolve the conflict. If they do not, execution remains disabled.

## Status definitions

- `verified-executable`: address, bytecode, implementation, ABI, pool relationship, token decimals, allowance target, quote path, and no-broadcast execution simulation all passed. This branch does not wire that status into runtime route selection.
- `verified-quote-only`: quote evidence is sufficient, but execution remains unresolved. Approval and transaction calldata must not be produced.
- `unverified`: candidate evidence exists but mandatory verification is incomplete.
- `unavailable`: no usable authoritative deployment or route was found.
- `disabled`: a known conflict, compatibility issue, integrity issue, or unsafe execution surface requires the route to remain disabled.

The committed registry is conservative. No external provider is executable. Offline fixtures exercise all status transitions but are explicitly not live evidence and cannot promote a real provider.

## Starting baseline and regression boundary

- Starting `main`: `11af092ba439dde8b00271044f8da9f0d128a482` (squash merge of PR #95).
- Application version: `0.1.0`.
- Existing deployable Vercel functions: `12` (Hobby-plan maximum).
- Existing router configuration: `src/lib/router/routerConfig.ts`, `src/config/externalDexes.ts`, `src/config/unitflow.ts`, `src/config/synthra.ts`, and `src/config/xylonetStablePools.ts`.
- `/api/version` remains an exact rewrite to the existing `/api/health?publicVersion=1` shared dispatch.
- Footer, Docs, Terms, Privacy, security headers, CSP Report-Only, Arc attribution, cron-job.org scheduler documentation, and Bridge/CCTP behavior remain unchanged.
- `vercel.json` contains no Vercel Cron.

The audit lives under `src/lib/router-audit/`, `scripts/routerAudit.ts`, deterministic tests, this document, and one ordinary CI step. It adds no file under `api/`.

## Fixed-block methodology

A live audit:

1. Calls `eth_chainId` and requires decimal chain ID `5042002`.
2. Calls `eth_blockNumber` once.
3. Fetches that exact block with `eth_getBlockByNumber` and records number, hash, and timestamp.
4. Creates a fixed-block transport that requires that block tag for every compatible state read.
5. Uses the same block for bytecode, proxy slots, calls, token metadata, relationships, reserves/state, quotes, and simulations.

The transport rejects a missing tag or `latest` for state reads. It does not silently fall back to latest. If historical state is unsupported, the limitation is recorded and the affected comparison is non-comparable; the operator must rerun all providers at a new common block.

The RPC label is recorded, but the full URL, query credentials, authorization headers, and environment values are never printed or committed.

## Read-only RPC boundary

Allowed JSON-RPC methods:

- `eth_chainId`
- `eth_blockNumber`
- `eth_getBlockByNumber`
- `eth_getCode`
- `eth_getStorageAt`
- `eth_call`
- `eth_estimateGas`

Every other method is rejected before network I/O. Tests explicitly reject transaction broadcast, signing, wallet, chain-switch, and account-unlocking methods. The implementation imports no private key, mnemonic, account signer, wallet client, or browser-injected provider.

## Proxy verification

The audit independently records runtime code hashes and detects:

- EIP-1967 implementation slots;
- EIP-1967 beacon slots and beacon `implementation()`;
- transparent proxy admin slots;
- UUPS-compatible EIP-1967 implementation layout;
- EIP-1167 minimal proxies;
- otherwise recognizable delegatecall forwarding.

For proxies it records the proxy address/hash, implementation address/hash, beacon and beacon implementation where applicable, publicly readable admin, mutability warning, and re-audit requirement. An unresolved delegatecall proxy remains non-executable. A mutable proxy requires implementation-hash pinning and revalidation before every execution enablement; any implementation change invalidates prior evidence.

## Candidate inventory and current conservative status

### Coco — `unverified`

The authoritative source is `contracts/deployments/classic-v2-arc-testnet.json`; values are imported by the registry rather than duplicated:

- USDC: `0x3600000000000000000000000000000000000000`
- EURC: `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a`
- Factory: `0x4f05C941e024129F1939038215a3EDad2Ec35e78`
- Router: `0x1d15A06DCc7EABfF4fF4adbEffedbCab726Ffc68`
- Pair: `0xEC3E684735A094dCc50A7F44960787EE3f632de8`
- Expected factory hash: `0x0ccd40932aaaae4c6c5da6d27893e05b57a899fc1b36f2787860644d8ee5a831`
- Expected router hash: `0x88a49351e20ac1a5517749c07aaab3f9a7033c8d7d72d56fd6a40c1ae7e303fc`
- Expected pair hash: `0x7824be6285b588a88e4679f12c7022e1409b2214682459e29bef514355fc4177`
- Pair init-code hash: `0x41e0021258daf8bb9f478c945fc67263335306d58189c39845e7e8e45039cd6f`

The live audit checks code/hash/proxy state, `router.factory()`, symmetric `factory.getPair`, `pair.factory()`, exact token ordering, 6-decimal metadata, reserves, on-chain `getAmountsOut` for `0.01`, `0.1`, `1`, `10`, and `100` in both directions, and bounded no-broadcast calldata with explicit recipient/deadline/minimum output. A failed natural-state simulation is reported rather than hidden or state-overridden.

## Live read-only audit evidence

Live evidence is intentionally not committed as a frozen “latest” claim. Each run writes a schema-validated report under `artifacts/router-audit/live/`, including its exact audit date, block number, block hash, block timestamp, RPC provider label, provider statuses, promotion failures, and 40-row quote matrix. That directory is gitignored so a later offline run cannot overwrite or be mistaken for live evidence.

The generic proxy resolver is fail-closed: empty EIP-1967 slots plus the absence of a recognized forwarding pattern do not prove non-proxy status. Such candidates remain `unknown` unless independent evidence establishes the required fact. A live report may therefore remain more conservative than earlier diagnostics.

No transaction is signed, approved, submitted, or broadcast. No provider may expose executable targets unless every mandatory live promotion fact passes; successful reads or simulations alone are insufficient.

### XyloNet — `unverified`

Candidates:

- Factory: `0x60EDeFB094B84BBC6430cc130B358A43Ba1979e2`
- Router: `0x73742278c31a76dBb0D2587d03ef92E6E2141023`
- USDC/EURC pool: `0x3DF3966F5138143dce7a9cFDdC2c0310ce083BB1`

There is an ABI conflict between the supplied four-argument `getAmountOut(pool, tokenIn, tokenOut, amountIn)` candidate and the existing repository's three-argument `getAmountOut(tokenIn, tokenOut, amountIn)` diagnostic. The live audit probes both at the fixed block and preserves both results. It does not choose either for execution, produce approval calldata, or produce transaction calldata.

Execution remains disabled until verified source/ABI, factory-pool-router relationships, token order/decimals/state, invalid input behavior, allowance/execution targets, explicit recipient/deadline/minimum output, `msg.value` behavior, and bounded no-broadcast simulation are reconciled.

### UnitFlow — `disabled`

V2.5 candidates:

- Factory: `0xd67F63A4F26a497b364d1C82e6747Aec8B5743a5`
- Swap Router: `0x4AA8c7Ac458479d9A4FA5c1481e03061ac76824A`
- Liquidity Router: `0x0ef57CC428c851e9a9b7cD97190EF3D3EFe4B631`
- WUSDC: `0x911b4000D3422F482F4062a913885f7b035382Df`

Conflicting UniversalRouter candidates:

- `0xEaF3195bE51861632cd32850973C9515DA48e76F`
- `0xC43cC6A1E0F6EB48Cd4131522C1C73B13f3Da0F1` (existing frontend secondary evidence)

Permit2 candidate: `0x4ce562F687d0Ced27b79Ba51d79B63BD978F7F48`.

V3 official deployment evidence:

- Current Factory: `0xAb6A8AAb7d490007634ef59d424b5d89688a1971`.
- Interface Multicall: `0x0453A723b4974dBc044B60F303E37C394F7FDdE5`.
- NFT Descriptor: `0x9A37137Bdf62d3ddfA648f1616fcF38A91637660`.
- Nonfungible Token Position Descriptor: `0x421EeCc906A63C7261671e60A0F2Be9D02bbeB50`.
- Current Router/Position Manager plus every deprecated candidate listed by the official `UnitFlowV3-contract/deployments/addresses.json` artifact are preserved as conflicts rather than selected silently.

Any claimed official UnitFlow auxiliary contract not present in the already-collected official contract table or deployment artifact remains unresolved. The exact missing evidence is an authoritative Arc Testnet address in an official deployment artifact or independently verified explorer source. Such entries are not inferred, are not assigned an address, and remain non-executable.

V4 conflicts:

- Pool Managers: `0x33C02bfb9e39AAAe30F8bE86b850f8ce53d20C0b` and `0x33eF9605420D61FCCcEc1A3048Df65b92E1ff491`.
- Current Position Manager: `0xA464d4e7614546a127773CedBDDd64FB81421723`.
- Position Descriptors: `0x212f6Ded16644cB2858Aa9Cc7Df5150D0356C2C7` and `0x228432d1D38c2bcAa8eE579ed52C07ef190591e4`.

This PR does not activate V3, V4, hooks, UniversalRouter, Permit2, WUSDC wrapping, or arbitrary commands. It generates no UniversalRouter command bytes. WUSDC underlying asset, decimals, deposit/withdraw behavior, conversion ratio, rounding, recipient behavior, stranded-token risk, internal/external wrapping, extra transactions, `msg.value`, and final output asset all remain verification requirements. Therefore UnitFlow execution is disabled.

### Synthra — `unverified` / potentially `unavailable`

Existing frontend configuration supplies secondary candidates only:

- V3 Factory: `0x0fB6EEDA6e90E90797083861A75D15752a27f59c`
- Quoter: `0x3Ce954107b1A675826B33bF23060Dd655e3758fE`
- SwapRouter: `0xA545bCB1Bd7985c59ea162aB1748A0803434C31b`
- Position Manager: `0x444Cc395346428216fB6f2892eb03cB804aE4CD5`
- UniversalRouter: `0xbf4479C07Dc6fdc6dAa764A0ccA06969e894275F`

A frontend label is not authoritative Arc deployment evidence. Until official deployment files or verified Arcscan relationships establish factory/router/quoter/pool/fee/token ordering and proxy state, Synthra remains non-executable, produces no approval/transaction action, and produces no placeholder zero quote.

## Decimal and gas rules

Application USDC and EURC amounts use ERC-20 6-decimal raw units. Arc native gas accounting uses 18-decimal raw units. These values are typed, recorded, and formatted separately; raw gas units are never compared directly with raw token amounts.

A USDC gas-cost estimate is omitted unless a valid conversion source, conversion block, and method are available. No fixture or live report fabricates one.

## Running the audit

Deterministic offline mode (no RPC or network):

```sh
npm run routers:audit -- --offline-fixtures
# or
npm run routers:audit:offline
```

Live operator mode:

```sh
ARC_TESTNET_RPC_URL='<operator supplied Arc Testnet RPC>' \
ARC_TESTNET_RPC_LABEL='provider label without credentials' \
npm run routers:audit
```

Never put the live command in Vercel builds/deployments, browser code, Serverless Functions, Cron, or ordinary PR CI. Normal CI runs offline fixtures only.

## Artifacts and redaction

Reports are written under mode-separated gitignored directories:

- live evidence: `artifacts/router-audit/live/`;
- deterministic fixtures: `artifacts/router-audit/offline/`.

Each directory contains `audit-report.json`, `audit-report.md`, provider evidence summaries, `conflict-summary.md`, `proxy-summary.md`, and `disabled-provider-summary.md`. Live mode additionally emits `quote-matrix.md`. Offline generation never deletes or overwrites live artifacts, and vice versa.

Artifacts are scanned before writing. Full RPC URLs, credentialed query strings, authorization headers, local filesystem paths, private environment values, wallet details, and private keys must not appear. Only sanitized fixture examples belong in Git.

## Re-audit triggers

Re-run a full fixed-block audit when any candidate address, runtime hash, implementation, beacon, admin, ABI, factory/pool relationship, token metadata, fee, command format, wrapping behavior, or official deployment evidence changes. A mutable proxy upgrade invalidates prior implementation evidence immediately. Do not re-use provider quotes across different block numbers or hashes.

## Rollback

Rollback removes only:

- `src/lib/router-audit/`;
- `scripts/routerAudit.ts` and `scripts/routerAudit*.test.ts`;
- router audit package scripts;
- the offline CI step;
- the `artifacts/router-audit/` ignore entry;
- this document.

Rollback must not modify deployed contracts, Bridge/CCTP, route selection, `/api/version`, security headers, footer/legal/Docs surfaces, scheduler configuration, or Vercel project settings.
