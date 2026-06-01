# Troubleshooting

This guide documents common Coco DEX user-facing failures on Arc Testnet.

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
