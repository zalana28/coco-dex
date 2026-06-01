# Approvals

Approvals are a standard DeFi permission mechanism. They allow a spender contract to move a specific token from a wallet up to the approved allowance.

## Route-specific spenders

Coco DEX compares multiple routes. Each route can use a different spender or route permission flow:

- Coco: Coco router spender.
- XyloNet: XyloNet router spender.
- UnitFlow: route-specific UnitFlow permission behavior when selected.
- Synthra: Synthra router spender.

Users should not assume that approving one route approves every route. Router approvals are isolated by spender address and token.

## What an approval means

An ERC-20 approval grants a spender permission to transfer tokens from the user's wallet. It does not itself perform the swap. The swap transaction comes after approval if allowance is required.

## User guidance

- Verify the selected route before approving.
- Verify the token being approved.
- Verify the spender shown in the wallet if the wallet exposes it.
- Approve only amounts and spenders you understand.
- Never share seed phrases or private keys to solve approval issues.

## Developer guidance

Documentation-only changes must not alter route-aware spender selection. Do not change approval spender addresses, approval amounts, approval mode behavior, or allowance checks in a docs PR.

## Troubleshooting approvals

### Approval required

The selected route cannot execute until the spender has sufficient allowance or the required route permission is satisfied.

### Approval pending

Wait for the approval transaction to confirm on Arc Testnet, then refresh allowance state by using the app flow.

### Approval reverted

The wallet or network rejected the approval transaction. Recheck network, token balance for gas, and wallet state.

### Approved wrong route

Approving one external router does not approve another. Select the intended route and approve that route's spender if prompted.
