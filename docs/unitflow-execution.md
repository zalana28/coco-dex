# UnitFlow Execution Diagnostics

UnitFlow remains quote-only until execution is proven for the active route.

The V2.5 quote diagnostic confirms liquidity for `EURC -> WUSDC` and `WUSDC -> EURC`, but the V2.5 Swap Router execution diagnostic did not prove a complete Coco UI token path:

- `USDC -> WUSDC -> EURC` quote discovery reverts with `ArcFlowV25Library: PAIR_NOT_CREATED`.
- `EURC -> WUSDC -> USDC` quote discovery reverts with `ArcFlowV25Library: PAIR_NOT_CREATED`.
- `EURC -> WUSDC` quotes, but `swapExactTokensForTokens` and `swapExactTokensForTokensSupportingFeeOnTransferTokens` simulations reverted with `TransferHelper::transferFrom failed` for the diagnostic account because router allowance is zero.

The V2.5 Swap Router path remains disabled. UniversalRouter execution is enabled only for the separately proven native wrap route below.

## UniversalRouter Diagnostic

`scripts/debugUnitFlowUniversalRouter.ts` proved a UniversalRouter execution path for the normal Coco UI direction `USDC -> EURC`.

Working command sequence:

- Commands: `0x0b0804`
- `WRAP_ETH`
- `V2_SWAP_EXACT_IN`
- `SWEEP`

Working inputs:

- `WRAP_ETH(address recipient, uint256 amountMin)`
  - `recipient = UnitFlow UniversalRouter`
  - `amountMin = native USDC amount`, using 18 decimals
- `V2_SWAP_EXACT_IN(address recipient, uint256 amountIn, uint256 amountOutMin, address[] path, bool payerIsUser)`
  - `recipient = UnitFlow UniversalRouter`
  - `amountIn = WUSDC amount`, using 18 decimals
  - `amountOutMin = EURC min out`, using 6 decimals
  - `path = [WUSDC, EURC]`
  - `payerIsUser = false`
- `SWEEP(address token, address recipient, uint256 amountMin)`
  - `token = EURC`
  - `recipient = user`
  - `amountMin = EURC min out`, using 6 decimals

Decimals discovered on-chain:

- USDC ERC-20 interface: 6 decimals
- WUSDC: 18 decimals
- EURC: 6 decimals
- Native USDC value / WUSDC amount: 18 decimals

Execution requirements:

- `msg.value` is required for the native USDC amount.
- ERC-20 USDC approval is not required for the working native wrap route.
- Permit2 is not required for the working native wrap route.
- UnitFlow execution is enabled only for `USDC -> EURC`.

Still not enabled:

- `EURC -> USDC`, because returning UI USDC would require a separately proven WUSDC unwrap/output path.
- Existing WUSDC wallet flow, because Coco UI does not expose WUSDC as the selected input token.
