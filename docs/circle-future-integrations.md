# Circle Services: Current Bridge and Future Integrations

This document separates Coco DEX's current Circle-related implementation from possible future services. The current `/bridge` route uses Circle Bridge Kit, the Viem v2 adapter, CCTP V2, and the Forwarding Service for USDC transfers from Ethereum Sepolia or Base Sepolia to Arc Testnet.

Circle Wallets user flows, Gas Station policies, Circle Contracts API integrations, and frontend Circle API keys are not implemented. Use of Circle software and infrastructure does not imply endorsement or partnership.

## Public references used

- Circle API Keys: https://developers.circle.com/api-reference/keys
- CCTP: https://developers.circle.com/cctp
- Circle Wallets: https://developers.circle.com/wallets
- Gas Station: https://developers.circle.com/wallets/gas-station
- Circle Contracts: https://developers.circle.com/contracts
- Console wallets overview: https://console.circle.com/wallets/overview
- Console smart contracts overview: https://console.circle.com/smart-contracts/overview

The console overview links can require sign-in. Do not invent console-only behavior when unauthenticated access is unavailable.

## API Keys And Health

The backend-only readiness check uses `CIRCLE_API_KEY` to call `GET https://api.circle.com/v1/w3s/wallets` from Vercel serverless functions. The response reports only safe health fields such as configuration state, Circle status, endpoint URL, message, and timestamp.

Setup:

- Create an API key in the Circle Console.
- Add `CIRCLE_API_KEY` to `.env.local` for local development.
- Add `CIRCLE_API_KEY` to Vercel Environment Variables.
- Optionally set `CIRCLE_BASE_URL`; it defaults to `https://api.circle.com`.
- Set `CIRCLE_ENV=testnet` for environment labeling.
- Redeploy after adding or changing Vercel environment variables.
- Test production with `curl https://coco-dex.vercel.app/api/circle/health`.

Rules:

- API keys are server-side credentials.
- Never expose API keys in frontend code.
- Never commit API keys.
- Do not use a `VITE_` prefix for a Circle API key.
- Use `CIRCLE_API_KEY`, not `VITE_CIRCLE_API_KEY`.
- Do not return API keys, raw authorization headers, full sensitive Circle responses, wallet private data, or secrets from health endpoints.

Circle docs distinguish API keys for server-side REST APIs from client keys and kit keys. Permissionless products like CCTP do not require an API key.

## Current CCTP V2 Bridge

The public `/bridge` route transfers testnet USDC from Ethereum Sepolia or Base Sepolia to Arc Testnet. EURC is not offered by this Bridge page.

Circle CCTP facilitates native USDC transfers across supported blockchains by burning USDC on the source chain and minting USDC on the destination chain. This is different from a traditional liquidity-pool bridge or wrapped-token bridge.

The Bridge lifecycle is approval, source burn, attestation, and forwarded destination mint. Recovery stores the Bridge Kit result and calls `retryBridge` after interruption so a recorded successful burn is not repeated. Arc Testnet EVM chain ID `5042002` and CCTP domain `26` are separate identifiers and types. ERC-20 USDC application transfers use 6-decimal units; native Arc gas accounting uses 18-decimal raw EVM units.

The browser-wallet Bridge path is permissionless and does not require `CIRCLE_API_KEY`. `/api/circle/health` remains an optional server/admin diagnostic.

## Circle Wallets

Future idea: embedded wallet onboarding for users who do not already have a wallet.

Circle Wallets can provide APIs and SDKs for embedded wallet experiences, key management, signing, and supported blockchain interactions. Coco DEX currently relies on connected wallets and does not implement Circle Wallets.

## Gas Station

Future idea: gasless UX for Circle Wallet users.

Circle Gas Station is tied to Circle Wallets and gas sponsorship policies. On EVM chains, gas abstraction depends on smart contract account or account-abstraction style setup. This does not make normal MetaMask, Rabby, or injected-wallet users automatically gasless.

Coco DEX does not implement Gas Station today.

## Smart Contracts

Future idea: admin or developer tooling for contract read/write workflows and event monitoring.

Circle Contracts documentation describes exploring, deploying, interacting with, and monitoring smart contracts through console or APIs. Coco DEX does not add Circle Contracts integration in this PR.
