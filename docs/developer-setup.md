# Developer Setup

This document describes local Coco DEX setup for docs and app development.

## Prerequisites

- Node.js compatible with the project dependencies.
- npm.
- A wallet for manual Arc Testnet checks.
- Environment variables configured locally for server/API features.

## Install

```bash
git clone <repo-url>
cd coco-dex
npm install
cp .env.example .env.local
```

## Environment variables

Use placeholders locally and real values only in private local or deployment environments. Do not commit real secrets.

Required or commonly used variables:

```text
ARC_TESTNET_RPC_URL=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
CRON_SECRET=...
VITE_WALLETCONNECT_PROJECT_ID=...
```

Notes:

- `ARC_TESTNET_RPC_URL` is used by server-side/indexer flows.
- `SUPABASE_URL` points to the Supabase project.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be exposed to the frontend.
- `CRON_SECRET` protects cron/indexer endpoints.
- `VITE_WALLETCONNECT_PROJECT_ID` is public frontend configuration for WalletConnect.
- Do not prefix server-only secrets with `VITE_`.

## Run locally

```bash
npm run dev
```

Open the local Vite URL, connect a wallet, and switch to Arc Testnet for transaction flows.

## Build and checks

```bash
npm run build
npm test
npm run typecheck
npm run lint
npx tsc -p api/tsconfig.json --noEmit
```

## Manual checks for docs PRs

- `/docs` loads.
- Navbar Docs link works.
- Mobile docs page is readable and has no horizontal overflow.
- Public website does not reintroduce a GitHub link.
- Swap/router files are unchanged.
- Analytics/indexer logic is unchanged.
- No Circle API integration is added.
- No secrets or API keys are committed.

## Docs-only scope lock

A docs-only PR can add markdown docs, README links, navigation links, and UI-only docs components. It must not modify swap/router execution logic, ABI/address files, approval spender behavior, min output calculations, deadline logic, simulation/write behavior, quote calculations, analytics/indexer logic, or debug scripts.
