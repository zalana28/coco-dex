# CCTP Arc Bridge — Manual Preview Test

Owner-run verification for the browser-wallet CCTP V2 bridge from Ethereum Sepolia
and Base Sepolia to Arc Testnet. Hermes does **not** submit any transactions.

## Scope

- Source: Ethereum Sepolia or Base Sepolia
- Destination: Arc Testnet (chain id 5042002, CCTP domain 26)
- Token: USDC only
- Browser wallets only (no Circle API key in frontend code)
- No new Serverless Function, no Vercel Cron

## Preconditions (Preview only)

- A dedicated test wallet with ~1 USDC on the chosen Sepolia source.
- Sufficient native source gas (ETH on Sepolia).
- An Arc recipient you control (defaults to the connected account).
- Circle Forwarding Service enabled (default).

## Cases

1. Standard (SLOW) estimate
   - Estimate bridge with 1 USDC, Standard selected.
   - Expect:
     - CCTP protocol fee: **0 USDC — Standard transfer** (never "Unavailable").
     - Forwarding Service fee: estimated value.
     - Source gas: estimated ETH.
     - Destination gas: **Paid by Forwarding Service**.
     - Destination amount: net of fees.
     - Recipient shown (full address).

2. Fast unavailable, Standard still available
   - If the FAST estimate cannot be produced, the Fast toggle must NOT appear.
   - Standard remains selectable and executable.
   - Copy: "Fast estimate unavailable — Standard transfer is still available."

3. Source-chain switch
   - Switching source updates the USDC contract, gas token, and re-estimates.

4. Approval lifecycle
   - Approve USDC → Burn on source → Fetch attestation → Mint on Arc.

5. Forwarded mint lifecycle
   - After burn, Circle forwards the Arc mint.
   - Destination gas is not required from the wallet.
   - Forwarding fee is deducted from the destination mint.

6. Recoverable failure + retry
   - If a burn succeeded but mint is interrupted, the recovery card appears.
   - Retry resumes from the failed step; the burn is **not** repeated.
   - Explorer links point to the correct chain.

7. Mobile 320px
   - No horizontal overflow; recipient input scrolls; actions stack.

## What must NOT happen

- No "CCTP protocol fee estimate is unavailable" for Standard.
- No live transaction broadcast by Hermes or CI.
- No API key or credentialed RPC URL in the bundle or UI.
- No silent switch between Forwarded and Direct mint after estimation.
