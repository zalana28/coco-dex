# XyloNet Manual Test Plan

Owner-run procedure for verifying XyloNet executable integration on Arc Testnet.

## Prerequisites

- Dedicated Arc Testnet wallet (do not use main funds)
- 0.01–0.1 test USDC available
- Arc Testnet RPC reachable
- `VITE_ENABLE_XYLONET_EXECUTION=true` set in local/preview environment only

## Pre-flight checks

1. Verify the app shows XyloNet provider card with:
   - Audit: Unverified
   - Execution: Operator approved · Arc Testnet
2. Verify the risk disclosure text is displayed
3. Verify the execution button is disabled until the feature flag is enabled
4. Verify Coco route shows "Unavailable — no liquidity" (zero reserves expected)

## First direction: USDC → EURC

1. Connect dedicated test wallet to Arc Testnet
2. Enter 0.01 USDC as input
3. Select EURC as output
4. Wait for XyloNet quote to load
5. Verify quote shows a positive expected output
6. Verify minimum received is calculated from slippage
7. Verify gas estimate is displayed
8. Verify router address matches: `0x73742278c31a76dBb0D2587d03ef92E6E2141023`
9. Verify pool address matches: `0x3DF3966F5138143dce7a9cFDdC2c0310ce083BB1`
10. Verify allowance target equals the router address
11. Acknowledge the risk disclosure (first time only)
12. Confirm simulation status shows "Simulation passed"
13. Approve the exact amount to the XyloNet router
14. Wait for approval transaction to confirm
15. Verify the swap button is now enabled
16. Click swap and confirm in wallet
17. Wait for transaction receipt
18. Verify transaction hash and Arcscan link are displayed
19. Verify EURC balance increased
20. Check remaining allowance on Arcscan (should be 0 if exact approval)

## Reverse direction: EURC → USDC

Only after the first direction succeeds:

1. Flip tokens (EURC → USDC)
2. Enter 0.01 EURC
3. Verify XyloNet quote loads
4. Repeat steps 6–19 above

## Error scenarios to test

- **Feature flag off**: execution button shows "Execution not enabled"
- **Wrong network**: execution blocked with "Wrong network"
- **No liquidity**: XyloNet shows "No available liquidity" and is excluded from Best Route
- **Simulation failure**: execution blocked with sanitized error reason
- **Wallet rejection**: state preserved, no corruption
- **Double-click**: only one transaction submitted

## Disable conditions

Immediately set `VITE_ENABLE_XYLONET_EXECUTION=false` if:
- Liquidity is unavailable
- Any result is unexpected
- Router code hash changes
- Simulation fails repeatedly
- Pool token membership changes

## Important

- Hermes does not broadcast transactions automatically
- The owner manually approves all test transactions
- This route has not passed Coco DEX's strict independent verification gate
- No claim of formal audit or contract safety
