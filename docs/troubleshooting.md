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

## Insufficient gas

The wallet's native balance is too low to pay for a transaction. Because Arc
pays gas in USDC, this can happen while the ERC-20 USDC balance still looks
healthy — they are the same underlying asset at different decimal scales
(native 18, ERC-20 6).

This is also why **Max** on USDC does not select the entire balance: it holds
back a small reserve (`GAS_BUFFER_USDC`, 0.1 USDC). Without it, a max swap
simulates cleanly and then reverts. `eth_call` does not deduct the upfront gas
cost, but `eth_estimateGas` and real execution deduct `gasLimit × gasPrice`
*before* the call runs, so `transferFrom` finds the balance short. Max on EURC
still selects the full balance — EURC does not pay for gas.

## State moved — refresh quote and retry

The chain advanced more than two blocks between the simulation and submission,
so the simulated result may no longer hold. Re-quote and try again.

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

## RPC is busy / HTTP 429

Arc Testnet's public RPC is rate-limited, and approve + swap previously competed
for that budget with roughly ten background pollers.

What the app now does:

- **Pauses quote, balance and reserve polling while a transaction is in flight.**
  Existing quotes stay on screen; only the requests stop.
- **Retries transient failures only**, with exponential backoff and jitter
  (`src/lib/router/quoteQueryOptions.ts`). A reverted call is never retried — it
  would fail identically.
- **Keeps one retry layer, not two.** The viem transport is held at
  `retryCount: 1` because react-query retries above it and the two multiply.
- **Polls one Synthra fee tier**, the one that last won for the pair; the other
  two are fetched only when the all-routes panel is open.
- **Opens a circuit breaker** when two or more distinct routes fail transiently
  within 10s. Polling stops for 45s behind a single banner —
  *"Arc Testnet RPC is busy — quotes paused for Ns."* — with a **Retry now**
  button, instead of five separate red errors for one underlying cause.

If 429s persist, set a dedicated endpoint. `VITE_ARC_RPC_PRIMARY` (see
`.env.example`) becomes the primary transport with the public endpoint as an
automatic fallback. Leaving it unset is supported, just more prone to rate
limiting.

## Quote stale

The route's quote is older than its TTL (`DEFAULT_ROUTE_TTL_MS`, 30s). The swap
guard blocks execution and the route badge switches from "Fresh quote" to
"Quote stale". Wait for the next refresh, or change the amount to force a
re-quote.

Freshness is measured from when the underlying chain read completed
(react-query's `dataUpdatedAt`), not from when the quote object was built. This
matters: the quote objects are rebuilt on every clock tick, so stamping the
construction time would make every quote look permanently fresh — which is
exactly what used to happen, leaving the guard and the badge inert.

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
