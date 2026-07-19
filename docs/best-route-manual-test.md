# Best Route Auto-Selection & Synthra Manual Test

Owner-run verification for the unified best-route selection and Synthra quote behavior on Arc Testnet.

## Best Route auto-selection

The single `selectBestRoute` result drives:
- "Best route" badge
- automatically selected route
- Swap button provider label
- confirmation dialog provider
- transaction execution provider

Ranking: highest `minReceived` (minAmountOut), then gross output, then source priority.
Anti-flap: when the current selection is still valid, switch only when the new
best improves minReceived by >= 1bp. Immediate switch when current becomes
unavailable or stale.

### Scenarios

1. **Coco has highest minReceived** → Coco automatically selected. Swap button: "Swap via Coco".
2. **UnitFlow becomes higher** (after fresh quote) → selection updates to UnitFlow.
3. **XyloNet is quote-only** → cannot become selected for execution.
4. **Synthra quote fails** → excluded from ranking, shows "No active USDC/EURC pool" or "Temporarily unavailable — retrying".
5. **Synthra recovers** → can join ranking only after a fresh valid quote.
6. **Selected route becomes stale** → execution disabled and next valid route selected.
7. **Confirmation dialog open** → provider is not silently switched.
8. **Swap pending** → route remains frozen.

## Synthra diagnosis

Root cause: Synthra Quoter is Uniswap V3 **Quoter V2**, but the old ABI used a
5-component tuple that collided with `quoteExactInput(bytes,uint256)` selector
(0xc6a5026a). The deployed V2 quoter expects the 6-component tuple
(0xf7729d19). The wrong selector resolved to a non-matching function → revert →
viem could not decode the 1-value response → "Contract read failed".

Also, `getPool` reverts for every fee tier (500/3000/10000) → **no active
USDC/EURC pool exists**, correctly classified as "No active USDC/EURC pool"
(unavailable-no-liquidity), not a generic contract failure.

### Synthra pinned addresses (Arc Testnet, chain 5042002)

- Factory: `0x0fB6EEDA6e90E90797083861A75D15752a27f59c`
- Quoter V2: `0x3Ce954107b1A675826B33bF23060Dd655e3758fE`
- Swap Router: `0xA545bCB1Bd7985c59ea162aB1748A0803434C31b`
- Universal Router: `0xbf4479C07Dc6fdc6dAa764A0ccA06969e894275F`
- Allowance/execution target: Swap Router `0xA545bCB1Bd7985c59ea162aB1748A0803434C31b`

### Active ABI

- Quote: `quoteExactInputSingle(((address,address,uint256,uint24,uint160,address)))` → selector `0xf7729d19`
- Returns: `(uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)`
- Fee tiers probed: 500, 3000, 10000 — all revert (no active pool)

## Prerequisites

- Preview or local build with flags at defaults
- Dedicated Arc Testnet wallet

## Do not broadcast automatically.
