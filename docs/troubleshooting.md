# Troubleshooting

This guide documents common Coco DEX user-facing failures on Arc Testnet.

## Reading a failed transaction

Every failure in the transaction progress panel shows a one-line summary. When
the provider returned more than that, a **Details** disclosure appears beneath
it — expand it for the untruncated text (revert reason, explorer link) and use
**Copy** when reporting the problem.

The summary always comes from `classifySwapError` (`src/lib/mobileWallet.ts`),
never from a raw provider string. If you ever see `Version: viem@…` or a
`Details:` prefix in the UI, that is a bug: some call site is rendering
`error.message` directly instead of classifying it.

Revert reasons such as `INSUFFICIENT_OUTPUT_AMOUNT`, `EXPIRED`, and
`TRANSFER_FROM_FAILED` appear at the *end* of provider error strings, which is
why the full text matters and why nothing on this path is truncated.

## Wallet provider not found

Install or unlock a browser wallet, use a wallet browser, or connect through WalletConnect if configured.

## WalletConnect project ID missing

WalletConnect requires `VITE_WALLETCONNECT_PROJECT_ID` in the deployment environment. If it is missing, the app can still expose injected wallets but WalletConnect may not appear.

## Wrong network

Coco DEX requires Arc Testnet. Use the app prompt or wallet network selector to switch to Arc Testnet before approving or swapping.

## Insufficient balance

Confirm the wallet has enough input token and enough native gas token for the transaction. Arc Testnet uses USDC as the native gas token, while the app also displays ERC-20 USDC for DeFi token flows.

## Approval required

The selected route's spender or permission flow is not satisfied. Approve the selected token for the selected route if prompted, wait for confirmation, then continue.

## Router reverted

A router can revert if liquidity moves, the quote becomes stale, minimum received is too high, allowance is insufficient, or the route is unavailable at execution time.

Expand **Details** to read the decoded reason, which identifies which of these
it was:

| Revert reason | Cause |
|---|---|
| `INSUFFICIENT_OUTPUT_AMOUNT` | Price moved past your slippage tolerance between quote and execution. Re-quote and retry, or raise slippage. |
| `EXPIRED` | The transaction sat unconfirmed past the deadline. Resubmit. |
| `TRANSFER_FROM_FAILED` | Allowance or balance was insufficient at execution time — often because gas was deducted from the same USDC balance being swapped. |

## Simulation failed

Simulation can fail before the transaction is sent. Common causes include missing allowance, invalid balance, stale quote, wrong network, route state changes, or an RPC/client issue.

## Deadline expired

Submit a fresh transaction. Deadlines prevent execution after a configured time window.

## Transaction pending

Wait for wallet confirmation and network inclusion. If the app shows a transaction hash, open it in Arcscan to inspect status.

## Analytics not updated yet

Analytics depend on indexer timing. A successful transaction can appear in the wallet or explorer before it appears in analytics.

## Mobile wallet issues

- Desktop browser extensions provide injected wallet providers.
- Mobile normal browsers often need WalletConnect.
- Wallet browsers can provide injected providers directly.
- If WalletConnect fails, verify `VITE_WALLETCONNECT_PROJECT_ID` in the deployed environment.

### "Return to this tab, then try again."

The mobile wallet returned EIP-1193 error `-32002` ("Requested resource not
available"). This happens when the browser tab is backgrounded during the
hand-off to the wallet app — the request is dispatched while the page is not
visible, and the provider rejects it.

Return to the browser tab and retry. The app waits for the tab to become
visible again before dispatching connect and swap requests
(`isDocumentActive` / `waitForDocumentActive` in `src/lib/mobileWallet.ts`), so
this should be rare; if it still occurs, the wallet returned the error before
the guard could apply.
