# UnitFlow Execution Diagnostics

UnitFlow remains quote-only until execution is proven for the active route.

The V2.5 quote diagnostic confirms liquidity for `EURC -> WUSDC` and `WUSDC -> EURC`, but the V2.5 Swap Router execution diagnostic did not prove a complete Coco UI token path:

- `USDC -> WUSDC -> EURC` quote discovery reverts with `ArcFlowV25Library: PAIR_NOT_CREATED`.
- `EURC -> WUSDC -> USDC` quote discovery reverts with `ArcFlowV25Library: PAIR_NOT_CREATED`.
- `EURC -> WUSDC` quotes, but `swapExactTokensForTokens` and `swapExactTokensForTokensSupportingFeeOnTransferTokens` simulations reverted with `TransferHelper::transferFrom failed` for the diagnostic account because router allowance is zero.

UniversalRouter execution is intentionally deferred. Enabling it requires verified Permit2 approval/signature handling and UniversalRouter command/input encoding for Arc Testnet.
