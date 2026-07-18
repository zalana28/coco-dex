# Browser Security Headers

Coco DEX applies baseline browser headers through `vercel.json`. This document records the browser-origin inventory and CSP rollout decision for Arc Testnet review.

## Enforced baseline

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- restrictive `Permissions-Policy` disabling camera, microphone, geolocation, payment, USB, serial, HID, motion sensors, and related APIs not used by the app
- `X-Frame-Options: DENY`
- `Cross-Origin-Opener-Policy: same-origin-allow-popups` to preserve wallet popups

## CSP status

CSP is intentionally `Content-Security-Policy-Report-Only`, not enforced. The repository does not have automated real-wallet coverage for injected extensions or WalletConnect pairing, and local Vite preview does not apply Vercel headers. Report-only provides visibility without breaking wallet or Bridge connectivity before compatibility is proven.

The policy does not use a global `*`, `https:`, `wss:`, `*.circle.com`, `*.walletconnect.com`, `*.supabase.co`, or `*.vercel.app` allowance.

## Explicit browser origins

| Origin | Purpose |
|---|---|
| `'self'` | Vite assets and same-origin APIs |
| `https://rpc.testnet.arc.network` | Arc Testnet wallet/read RPC |
| `https://ethereum-sepolia-rpc.publicnode.com` | Bridge Kit Ethereum Sepolia RPC |
| `https://sepolia.base.org` | Bridge Kit Base Sepolia RPC |
| `https://iris-api-sandbox.circle.com` | CCTP V2 testnet attestation/forwarding state |
| `https://api.circle.com` | Bridge Kit telemetry endpoint; no application API key is sent by the browser |
| `https://relay.walletconnect.com`, `wss://relay.walletconnect.com` | WalletConnect relay |
| `https://explorer-api.walletconnect.com` | WalletConnect wallet discovery |
| `https://verify.walletconnect.com` | WalletConnect verification UI |
| `https://pulse.walletconnect.org` | WalletConnect operational telemetry |
| `https://fonts.googleapis.com`, `https://fonts.gstatic.com` | Static font CSS/files |

Supabase is not a browser origin: frontend analytics use same-origin `/api/*`; serverless functions hold Supabase credentials.

## Promotion gate

Do not promote CSP from report-only to enforcement until all are verified on the deployed Vercel preview with the exact header:

1. injected wallet connection and reconnect;
2. WalletConnect QR/pairing/reconnect with configured project ID;
3. Arc Testnet network switch;
4. Coco Classic V2 quote, approval, swap, and receipt polling;
5. Bridge estimate from Ethereum Sepolia and Base Sepolia;
6. Bridge approval, burn, attestation, Forwarding Service mint, and recovery after refresh;
7. mobile Playwright on iPhone 13 and Pixel 5;
8. no unexplained `securitypolicyviolation` events or blocked browser requests.

If an origin is added, record the exact observed request, feature, dependency version, and narrowest required directive. Never put credentialed RPC URLs, API keys, server secrets, or query tokens into CSP.

## Rollback

If a browser header breaks wallet or Bridge compatibility, revert the header-only commit or restore the previous `vercel.json`, redeploy, and verify the previous deployment SHA via `/api/version` and the footer. Do not modify contracts or transaction logic as part of a header rollback.
