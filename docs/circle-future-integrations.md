# Circle Future Integrations

This document records possible future Circle integrations for Coco DEX. Nothing in this section is implemented by the docs PR.

No Circle API calls, Circle SDKs, CCTP transactions, Circle Wallets flows, Gas Station policies, or Circle Contracts API integrations are added here.

## Public references used

- Circle API Keys: https://developers.circle.com/api-reference/keys
- CCTP: https://developers.circle.com/cctp
- Circle Wallets: https://developers.circle.com/wallets
- Gas Station: https://developers.circle.com/wallets/gas-station
- Circle Contracts: https://developers.circle.com/contracts
- Console wallets overview: https://console.circle.com/wallets/overview
- Console smart contracts overview: https://console.circle.com/smart-contracts/overview

The console overview links can require sign-in. Do not invent console-only behavior when unauthenticated access is unavailable.

## API Keys

Future backend-only readiness checks could use Circle API keys for server-side API calls, such as a backend `/api/circle/health` endpoint.

Rules:

- API keys are server-side credentials.
- Never expose API keys in frontend code.
- Never commit API keys.
- Do not use a `VITE_` prefix for a future Circle API key.
- If later introduced, document it as a backend secret such as `CIRCLE_API_KEY`, not as a frontend env var.

Circle docs distinguish API keys for server-side REST APIs from client keys and kit keys. Permissionless products like CCTP do not require an API key.

## CCTP

Future idea: bridge native USDC to Arc before swapping.

Circle CCTP facilitates native USDC transfers across supported blockchains by burning USDC on the source chain and minting USDC on the destination chain. This is different from a traditional liquidity-pool bridge or wrapped-token bridge.

Coco DEX does not implement CCTP today.

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

## PR scope lock

Do not add Circle API integration, secrets, SDK dependencies, frontend Circle keys, CCTP calls, Gas Station policy logic, or smart contract API calls in a docs-only PR.
