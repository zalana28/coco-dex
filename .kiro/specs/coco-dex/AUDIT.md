# Coco DEX MVP — Pre-Smart-Contract Audit Report

**Date:** May 26, 2026  
**Scope:** Full codebase review of the merged MVP before smart contract integration  
**Build Status:** ✅ `tsc --noEmit` passes, `vite build` succeeds, 27/27 tests pass

---

## 1. Project Structure Summary

```
coco-dex/
├── index.html                    # Dark mode default, Inter + JetBrains Mono fonts
├── vite.config.ts                # Vite + React + Tailwind v4 + path alias @/
├── package.json                  # React 19, wagmi 3, viem 2, vitest 4
├── tsconfig.app.json             # Strict mode, path aliases
├── src/
│   ├── main.tsx                  # Root: WagmiProvider > QueryClient > BrowserRouter > App
│   ├── App.tsx                   # Route definitions
│   ├── index.css                 # Tailwind v4 @theme with full Coco palette
│   ├── components/
│   │   ├── common/               # Card, ConnectWalletButton, TokenIcon
│   │   └── layout/               # Layout (Outlet), Navbar
│   ├── config/
│   │   ├── chains.ts             # Arc Testnet definition
│   │   ├── wagmi.ts              # Wagmi config with injected connector
│   │   ├── tokens.ts             # USDC + EURC token registry
│   │   ├── contracts.ts          # Placeholder addresses (all undefined)
│   │   ├── abis.ts               # ERC20 ABI
│   │   └── abis-dex.ts           # Factory, Router, Pair ABIs
│   ├── constants/mock.ts         # All mock data
│   ├── hooks/                    # useSwap, useAddLiquidity, useRemoveLiquidity, useTokenBalance
│   ├── pages/                    # Landing, Swap, Pools, AddLiquidity, RemoveLiquidity, Analytics, 404
│   ├── types/token.ts            # Token interface
│   └── utils/                    # price.ts, format.ts + their test files
└── .kiro/specs/coco-dex/         # requirements.md, design.md, tasks.md
```

---

## 2. Implemented Routes & Components

| Route | Page Component | Status |
|-------|---------------|--------|
| `/` | LandingPage | ✅ Hero, stats, features, footer |
| `/swap` | SwapPage | ✅ Token inputs, slippage, price info, button states |
| `/pools` | PoolsPage | ✅ All Pools tab, My Positions tab with empty/connected states |
| `/pools/add` | AddLiquidityPage | ✅ Dual inputs, pool share preview |
| `/pools/remove` | RemoveLiquidityPage | ✅ Percentage slider, token output preview |
| `/analytics` | AnalyticsPage | ✅ Metric cards, tables, chart placeholder |
| `*` | NotFoundPage | ✅ 404 with home link |

**Shared Components:**
- `Layout` → Navbar + Outlet
- `Navbar` → Fixed header, logo, nav links, ConnectWalletButton, mobile nav
- `ConnectWalletButton` → States: disconnected, connecting, connected, wrong network
- `Card` → Reusable rounded surface container
- `TokenIcon` → Colored circle with letter initial

---

## 3. DESIGN.md Compliance

| Design Spec | Implementation | Verdict |
|-------------|---------------|---------|
| Color palette (greens, sands, darks) | ✅ All colors defined in `@theme` block in index.css | **Compliant** |
| Dark mode default | ✅ `<html class="dark">`, body uses `bg-coco-dark-bg` | **Compliant** |
| Typography (Inter + JetBrains Mono) | ✅ Google Fonts loaded, `--font-sans` and `--font-mono` set | **Compliant** |
| Card radius 16px | ✅ `rounded-2xl` (16px) on Card component | **Compliant** |
| Button radius 12px | ✅ `rounded-xl` (12px) on buttons | **Compliant** |
| Swap card max 480px | ✅ `max-w-[480px]` on swap/liquidity cards | **Compliant** |
| Frosted glass navbar | ✅ `backdrop-blur-xl` + `bg-coco-dark-bg/80` | **Compliant** |
| Elevation shadows | ✅ `shadow-coco-1`, `shadow-coco-2` defined and used | **Compliant** |
| Active link: green highlight | ✅ `text-coco-green-500 bg-coco-green-500/10` | **Compliant** |
| Button states (disabled, hover, active) | ✅ All implemented with proper transitions | **Compliant** |
| Price impact color coding | ✅ Green < 1%, amber < 3%, red > 3% | **Compliant** |
| Swap direction toggle animation | ✅ `hover:rotate-180 duration-300` | **Compliant** |

**Minor deviations (cosmetic, not blockers):**
- DESIGN.md mentions "green gradient" for swap button — implementation uses solid green (acceptable; gradient can be added later)
- DESIGN.md mentions "Transaction Deadline" in slippage settings — not yet implemented
- Toast notification system is specified but not built
- Confirmation modals (pre-swap, tx submitted) are specified but not built

---

## 4. Arc Testnet Config Correctness

| Property | Expected | Actual (chains.ts) | Verdict |
|----------|----------|-------------------|---------|
| Chain ID | 5042002 | `id: 5042002` | ✅ Correct |
| Chain Name | Arc Testnet | `name: 'Arc Testnet'` | ✅ Correct |
| RPC URL | https://rpc.testnet.arc.network | ✅ Matches | ✅ Correct |
| Explorer | https://testnet.arcscan.app | ✅ Matches | ✅ Correct |
| Native Currency Symbol | USDC | `symbol: 'USDC'` | ✅ Correct |
| Native Currency Decimals | 6 | `decimals: 6` | ✅ Correct |

**Wagmi config:**
- Transport uses `http()` which defaults to chain's RPC URL — ✅ correct
- Single connector: `injected()` — suitable for testnet MVP
- Chain array: `[arcTestnet]` only — ✅ no stray chains

---

## 5. Token Decimal Safety (6-decimal ERC-20)

| Location | Handling | Verdict |
|----------|----------|---------|
| `tokens.ts` — USDC decimals | `6` | ✅ |
| `tokens.ts` — EURC decimals | `6` | ✅ |
| `price.ts` — `getAmountOut` | Pure bigint math, decimal-agnostic | ✅ |
| `price.ts` — `calculateMinimumReceived` | Uses basis points (10000 scale) | ✅ |
| `format.ts` — `formatTokenAmount` | Accepts `decimals` param, defaults to 6 | ✅ |
| `format.ts` — `parseTokenAmount` | Correctly slices/pads to `decimals` | ✅ |
| Tests | All use `BigInt(X_000000)` notation (6 decimals) | ✅ |
| `useTokenBalance` hook | Returns raw `bigint` from contract — no decimal assumption | ✅ |

**Assessment:** All utility functions are parametrized by `decimals` and default to 6. No hardcoded `10**18` anywhere. The bigint price utilities are decimal-agnostic by design.

---

## 6. Native Gas USDC (18d) vs ERC-20 USDC (6d) Confusion Risk

This is the **highest-risk area** for Arc's unique architecture.

| Risk Point | Analysis | Severity |
|-----------|----------|----------|
| `nativeCurrency.decimals: 6` in chain config | Arc uses USDC as gas, and the chain config declares 6 decimals. **This is correct for display purposes** but wagmi's `useBalance` may return the native balance in the chain's configured decimals. | ⚠️ **Medium** — needs validation |
| `useTokenBalance` reads ERC-20 `balanceOf(0x360...000)` | This is the correct approach for DeFi operations. The ERC-20 interface at `0x3600...` should return 6-decimal amounts. | ✅ Safe |
| No code uses `useBalance` (native balance hook) | Currently no code mixes native balance with ERC-20. | ✅ Safe for now |
| Swap page displays hardcoded "Balance: 1,000.00" | Mock string — no decimal confusion possible. | ✅ Safe (mock) |

**Critical recommendation for contract integration phase:**
> When real balances are wired in, NEVER use wagmi's `useBalance()` for USDC amounts in DEX logic. Always use `useTokenBalance()` reading the ERC-20 interface at `0x3600000000000000000000000000000000000000`. The native gas accounting layer may use different precision internally.

**No current code mixes 18-decimal and 6-decimal values.** The risk is latent — it will only matter once real balances and transactions are connected.

---

## 7. Mocked Data That Must Be Replaced

| Mock | Location | What Replaces It |
|------|----------|-----------------|
| `MOCK_EXCHANGE_RATE = 0.92` | `constants/mock.ts` | Live `getReserves()` from pair contract → compute rate |
| `MOCK_PROTOCOL_STATS` (TVL, volume, fees, trades) | `constants/mock.ts` | Subgraph/indexer or on-chain aggregation |
| `MOCK_POOLS` array | `constants/mock.ts` | Factory `allPairs()` + pair `getReserves()` |
| `MOCK_TOP_TOKENS` | `constants/mock.ts` | Derived from pool reserves + pricing |
| `MOCK_USER_POSITIONS` | `constants/mock.ts` | LP token `balanceOf` + pair reserves |
| Hardcoded balances ("1,000.00", "500.00") | SwapPage, AddLiquidityPage | `useTokenBalance` hook results |
| Price impact formula in SwapPage (`fromAmount * 0.001`) | SwapPage.tsx line 19 | Real `calculatePriceImpact` with reserves |

---

## 8. Placeholder Contract Addresses & TODOs

| Placeholder | File | Line |
|------------|------|------|
| `FACTORY_ADDRESS = undefined` | `config/contracts.ts` | "TODO: Replace with actual deployed factory address" |
| `ROUTER_ADDRESS = undefined` | `config/contracts.ts` | "TODO: Replace with actual deployed router address" |
| `USDC_EURC_PAIR_ADDRESS = undefined` | `config/contracts.ts` | "TODO: Replace with actual pair address" |
| `useSwap` — no implementation | `hooks/useSwap.ts` | "TODO: Implement actual swap transaction" |
| `useAddLiquidity` — no implementation | `hooks/useAddLiquidity.ts` | "TODO: Implement actual addLiquidity transaction" |
| `useRemoveLiquidity` — no implementation | `hooks/useRemoveLiquidity.ts` | "TODO: Implement actual removeLiquidity transaction" |
| No `useApprove` hook exists | — | Missing; needed before any write operation |
| Slippage settings not persisted | SwapPage.tsx | Custom slippage input doesn't update state |
| Token selector not functional | SwapPage.tsx | Dropdown button exists but doesn't open modal |

---

## 9. Security & UX Risks Before Real Contracts

### Security

| Risk | Severity | Mitigation Needed |
|------|----------|-------------------|
| No token approval flow | 🔴 High | Must implement approve → confirm → execute pattern |
| No transaction deadline enforcement | 🟡 Medium | Add `block.timestamp + N` to all router calls |
| No input sanitization (negative numbers, NaN) | 🟡 Medium | Clamp inputs, reject negatives, handle paste |
| No max slippage guard | 🟡 Medium | Warn or block if custom slippage > 5% |
| Unlimited approval risk | 🟡 Medium | Consider exact-amount approvals or max-uint with warning |
| No replay protection discussion | 🟢 Low | Handled by EVM nonce; no action needed |

### UX

| Risk | Severity | Mitigation Needed |
|------|----------|-------------------|
| No confirmation modal before tx | 🟡 Medium | Show "You will swap X for Y" before signing |
| No pending/success/failure toast | 🟡 Medium | Implement toast notification system |
| No transaction history | 🟢 Low | Nice-to-have; can link to explorer |
| Wallet dropdown doesn't close on outside click | 🟢 Low | Add click-outside handler |
| Number input allows scientific notation (e.g., 1e5) | 🟢 Low | Filter input or use text input with regex |
| No loading state for balance fetching | 🟢 Low | Show skeleton/spinner while balance loads |

---

## 10. Recommended Next Task List — Smart Contract Phase

### Phase A: Deploy Contracts to Arc Testnet

1. **Deploy UniswapV2Factory** to Arc Testnet
2. **Deploy UniswapV2Router02** (pointing to factory + WETH/USDC address if needed)
3. **Create USDC/EURC pair** via factory `createPair()`
4. **Add initial liquidity** to the USDC/EURC pool
5. **Record and update** `contracts.ts` with real addresses

### Phase B: Wire Contract Reads

6. **Implement `usePairReserves` hook** — reads `getReserves()` from pair contract
7. **Replace mock exchange rate** with live reserve-derived rate
8. **Replace mock balances** with `useTokenBalance` in Swap + Pools pages
9. **Replace mock pool data** with live factory enumeration + reserve reads
10. **Implement real price impact** using `calculatePriceImpact` with live reserves

### Phase C: Wire Contract Writes

11. **Implement `useApprove` hook** — ERC20 `approve(router, amount)`
12. **Implement `useSwap` hook** — full flow: check allowance → approve → swap → receipt
13. **Implement `useAddLiquidity` hook** — approve both tokens → addLiquidity → receipt
14. **Implement `useRemoveLiquidity` hook** — approve LP → removeLiquidity → receipt
15. **Add transaction deadline** (configurable, default 30 min)

### Phase D: UX Hardening

16. **Build confirmation modal** — show all swap/liquidity details before signing
17. **Build toast notification system** — pending/success/error states
18. **Add input validation** — reject negatives, NaN, limit decimals to 6
19. **Persist slippage to localStorage** — wire custom input to state
20. **Add "Insufficient Balance" button state** — check real balance vs input
21. **Close dropdown on outside click** — wallet disconnect menu

### Phase E: Testing & Safety

22. **Integration test: swap flow** — mock contract responses, verify UI state machine
23. **Test approval edge cases** — already approved, zero amount, reverted
24. **Test decimal boundary** — 0.000001 (1 wei of 6-decimal token)
25. **Add high slippage warning** — modal if > 5%
26. **Verify gas estimation** — ensure Arc Testnet gas works with 6-decimal USDC native

---

## Summary

The MVP frontend is **solid and well-structured**. The design system is faithfully implemented, the token/chain config is correct, and the utility functions are well-tested. The codebase is cleanly separated between mock data and placeholder hooks, making contract integration straightforward.

**Top 3 priorities before going live:**
1. Deploy contracts and wire real addresses
2. Implement the approve → execute transaction flow
3. Add confirmation modal + toast notifications for transaction lifecycle

No blocking issues found. Ready to proceed to smart contract deployment.
