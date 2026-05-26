# Coco DEX Smart Contracts — Security Audit Report

**Date:** May 26, 2026  
**Scope:** PR #3 — `contracts/src/` (CocoFactory, CocoPair, CocoRouter, CocoLibrary, CocoERC20)  
**Compiler:** Solidity 0.8.24, optimizer 200 runs  
**Tests:** 22/22 passing  

---

## 1. Reentrancy

| Function | Protection | Verdict |
|----------|-----------|---------|
| `CocoPair.mint()` | `lock` modifier (mutex via `unlocked` storage) | ✅ Safe |
| `CocoPair.burn()` | `lock` modifier | ✅ Safe |
| `CocoPair.swap()` | `lock` modifier | ✅ Safe |
| `CocoPair.sync()` | `lock` modifier | ✅ Safe |
| `CocoRouter.addLiquidity()` | Calls `pair.mint()` which has `lock` | ✅ Safe |
| `CocoRouter.removeLiquidity()` | Calls `pair.burn()` which has `lock` | ✅ Safe |
| `CocoRouter.swapExactTokensForTokens()` | Calls `pair.swap()` which has `lock` | ✅ Safe |

The mutex pattern (`unlocked = 0` before body, `unlocked = 1` after) prevents same-contract reentrancy into any locked function. Cross-function reentrancy within the pair is also blocked since all critical functions share the same lock.

**Note:** The router itself has no reentrancy guard, but all state-modifying operations delegate to the pair (which is guarded). The router is stateless beyond `factory` immutable, so there is no exploitable reentrancy vector.

---

## 2. Reserve Updates & Sync Events

| Operation | Updates reserves? | Emits Sync? | Verdict |
|-----------|:-:|:-:|:-:|
| `mint()` | ✅ `_update(balance0, balance1)` at end | ✅ | Correct |
| `burn()` | ✅ `_update(balance0, balance1)` after transfer | ✅ | Correct |
| `swap()` | ✅ `_update(balance0, balance1)` at end | ✅ | Correct |
| `sync()` | ✅ explicit | ✅ | Correct |

All reserve updates read fresh `balanceOf` values AFTER token transfers complete, then write to storage. This is the correct order (prevents stale-reserve exploits).

---

## 3. Constant Product Invariant

The swap function validates:

```solidity
(balance0 * 1000 - amount0In * 3) * (balance1 * 1000 - amount1In * 3) 
    >= reserve0 * reserve1 * 1000000
```

This is the standard Uniswap V2 invariant check with 0.3% fee factored in. ✅ **Correct.**

The `getAmountOut` formula in CocoLibrary:
```
amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
```
is algebraically equivalent to the invariant above. ✅ **Consistent.**

---

## 4. 0.3% Fee Math

- Fee is applied as `amountIn * 997 / 1000` (i.e., 0.3% removed from input before computing output)
- The invariant check uses `* 3` for the fee deduction on the balance side
- `getAmountIn` uses `997` in denominator to compute correct reverse

All formulas are consistent with Uniswap V2's fee model. Test `test_SwapFee_0_3_Percent` verifies exact formula correctness. ✅ **Correct.**

---

## 5. MINIMUM_LIQUIDITY Behavior

```solidity
if (_totalSupply == 0) {
    liquidity = _sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
    _mint(address(0xdead), MINIMUM_LIQUIDITY);
}
```

- `MINIMUM_LIQUIDITY = 1000` — permanently locked to `address(0xdead)` (not `address(0)` since CocoERC20 rejects minting to zero)
- Prevents first-depositor manipulation (inflation attack)
- Uses `0xdead` instead of `address(0)` — functionally equivalent for locking (tokens are irrecoverable)

✅ **Correct and safe.**

---

## 6. CREATE2 Pair Address Determinism

```solidity
bytes32 salt = keccak256(abi.encodePacked(token0, token1));
CocoPair newPair = new CocoPair{salt: salt}();
```

- Salt is deterministic: `keccak256(token0, token1)` where token0 < token1
- The pair address is predictable given the factory address, salt, and CocoPair init code hash

**Note:** The library uses `ICocoFactory.getPair()` (a storage read) rather than computing the CREATE2 address off-chain. This is simpler and avoids init code hash coupling but costs ~2100 gas per lookup vs. pure computation. Acceptable for an MVP.

✅ **Deterministic. No issue.**

---

## 7. Slippage & Deadline Enforcement

| Check | Location | Verdict |
|-------|----------|---------|
| `deadline >= block.timestamp` | Router `ensure` modifier | ✅ Applied to all entry points |
| `amountOutMin` check | `swapExactTokensForTokens` | ✅ Reverts if output < min |
| `amountInMax` check | `swapTokensForExactTokens` | ✅ Reverts if input > max |
| `amountAMin` / `amountBMin` | `removeLiquidity` | ✅ Checked after burn |
| `amountAMin` / `amountBMin` | `_calculateLiquidityAmounts` (addLiquidity) | ✅ Checked for optimal amounts |

**All user-facing functions enforce deadline and slippage.** Tests confirm revert behavior.

---

## 8. ERC-20 Return Value Handling

Both the pair and router use the same safe transfer pattern:

```solidity
(bool success, bytes memory data) = token.call(
    abi.encodeWithSelector(0xa9059cbb, to, value)
);
require(success && (data.length == 0 || abi.decode(data, (bool))), ...);
```

This correctly handles:
- Tokens that return `true` (standard ERC-20)
- Tokens that return nothing (non-standard like USDT)
- Tokens that revert (call returns `success = false`)

✅ **Correctly handles non-standard ERC-20s.**

---

## 9. Fee-on-Transfer Token Limitations

The contracts assume `transferFrom(from, pair, amount)` delivers exactly `amount` to the pair. **Fee-on-transfer tokens will cause the actual received amount to be less than expected**, leading to:
- `mint()` calculating less liquidity than expected (not dangerous, just less LP)
- `swap()` potentially failing the K invariant check (reverts safely)

**Verdict:** ⚠️ Fee-on-transfer tokens are **unsupported** but **fail safely** (transactions revert rather than drain funds). Since the Coco DEX only targets USDC and EURC (neither of which has transfer fees), this is acceptable.

**Recommendation for documentation:** Add a comment that fee-on-transfer tokens are not supported.

---

## 10. Arc-Specific Safety

| Check | Result |
|-------|--------|
| No `payable` functions | ✅ None in any source file |
| No `receive()` or `fallback()` | ✅ Not present |
| No `msg.value` usage | ✅ Not present |
| No WETH import/reference | ✅ Not present |
| No `address.transfer()` or `.send()` | ✅ Not present |
| No `selfdestruct` | ✅ Not present |
| No native ETH/USDC accounting | ✅ All operations use ERC-20 `balanceOf` |

✅ **Fully ERC-20 only. No native token interaction.**

---

## 11. Decimal Assumptions

The contract math is **entirely decimal-agnostic**:
- `getAmountOut` operates on raw `uint256` values regardless of decimal count
- `getReserves` returns raw `uint112` values
- `_sqrt(amount0 * amount1)` works on raw token units
- No hardcoded `10**6` or `10**18` anywhere in source

The only decimal-aware element is the `MINIMUM_LIQUIDITY = 1000` constant. For 6-decimal tokens, this locks 0.001 tokens worth of LP — effectively zero value. ✅ Safe.

**Tests explicitly verify 6-decimal behavior** at small (1 USDC), large (50K USDC), and dust (1 raw unit) scales.

✅ **Decimal-agnostic. Safe for any ERC-20 regardless of decimals.**

---

## 12. Licensing & Attribution

| File | License | Verdict |
|------|---------|---------|
| `CocoFactory.sol` | GPL-3.0-or-later | ✅ |
| `CocoPair.sol` | GPL-3.0-or-later | ✅ |
| `CocoRouter.sol` | GPL-3.0-or-later | ✅ |
| `CocoLibrary.sol` | GPL-3.0-or-later | ✅ |
| `CocoERC20.sol` | GPL-3.0-or-later | ✅ |
| `Deploy.s.sol` | GPL-3.0-or-later | ✅ |
| `MockERC20.sol` | MIT | ✅ (test-only, appropriate) |
| `CocoDex.t.sol` | GPL-3.0-or-later | ✅ |

All source contracts consistently use GPL-3.0-or-later. Attribution notes ("Inspired by Uniswap V2") are present in NatDoc. The implementation is a clean rewrite, not a byte-for-byte copy.

✅ **Consistent licensing with clear attribution.**

---

## 13. Deployment Script Safety

The `Deploy.s.sol` script:
- Reads `DEPLOYER_PRIVATE_KEY` from **environment variable** via `vm.envUint()` — never hardcoded
- Without `--broadcast` flag, Foundry runs in **simulation mode** (dry-run) — no transactions sent
- Logs all deployed addresses to console for manual verification
- Contains clear "DO NOT commit private keys" warning
- Creates pair in the same transaction batch for atomicity

**Dry-run command:**
```bash
forge script script/Deploy.s.sol --rpc-url https://rpc.testnet.arc.network
```
This will simulate without broadcasting. ✅ Safe to run.

---

## 14. Secrets & Keys

| Search | Result |
|--------|--------|
| Private keys in source files | ❌ None found (only in forge-std test fixtures — the well-known Anvil test key `0xac0974...`) |
| `.env` files committed | ❌ `.gitignore` excludes `.env` |
| Hardcoded deployer addresses | ❌ None |
| API keys or secrets | ❌ None |

✅ **No secrets committed.**

---

## Summary

| Category | Rating | Notes |
|----------|--------|-------|
| Reentrancy | ✅ Safe | Mutex on all pair state changes |
| Reserve updates | ✅ Correct | Fresh reads after transfers |
| Invariant math | ✅ Correct | Standard Uniswap V2 formula |
| Fee model | ✅ Correct | 0.3%, verified by test |
| MINIMUM_LIQUIDITY | ✅ Correct | Locked to dead address |
| CREATE2 | ✅ Deterministic | Via factory salt |
| Slippage/deadline | ✅ Enforced | All user-facing functions |
| ERC-20 handling | ✅ Safe | Handles non-returning tokens |
| Fee-on-transfer | ⚠️ Unsupported | Fails safely (reverts) |
| Arc safety | ✅ Clean | No native/payable/WETH |
| Decimal agnostic | ✅ Confirmed | No hardcoded decimals |
| Licensing | ✅ Consistent | GPL-3.0 with attribution |
| Deployment | ✅ Safe | Env-var key, dry-run capable |
| Secrets | ✅ None | .env excluded |

---

## Recommendations (Non-blocking)

1. **Add NatDoc note about fee-on-transfer tokens** — document that they are unsupported
2. **Consider adding `data` parameter to `swap()`** — Uniswap V2 passes callback data for flash swaps; omitting it is fine for MVP but limits future extensibility
3. **Consider unchecked math for gas savings** — overflow is impossible in 0.8.x, but `unchecked { }` blocks on known-safe operations save ~5% gas
4. **Factory `createPair` is permissionless** — anyone can create arbitrary pairs. This is intentional (same as Uniswap) but worth noting

---

## Verdict: ✅ SAFE TO MERGE AND DEPLOY

No critical or high-severity issues found. The contracts correctly implement a Uniswap V2-style AMM with appropriate safety measures for Arc Testnet's ERC-20-only token model.
