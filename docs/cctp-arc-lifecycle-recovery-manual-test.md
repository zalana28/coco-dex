# CCTP V2 Forwarding Service — Bridge Lifecycle & Recovery (Manual Test)

Branch: `fix/cctp-bridge-lifecycle-recovery`
Prerequisite: PR #103 is already merged (fee + canonical parameter fixes).

This PR hardens the **real-time CCTP V2 Forwarding Service bridge lifecycle** and adds
persistent, recoverable transfer tracking. It does **not** change any fee/parameter
semantics from PR #103, and it does **not** broadcast any live transaction automatically.

> Hermes did NOT execute the live manual tests below. They are owner-run on Preview only.

---

## What changed (summary)

- Lifecycle is now driven by a persistent `BridgeAttempt` model, not a one-shot SDK result.
- SDK lifecycle events (`kit.on('*')`) are subscribed **before** `bridge()` and correlated
  by `traceId`, so approval/burn hashes are captured the moment they exist.
- After a burn hash exists, the source **receipt is verified** with the source public client.
  A mined burn receipt overrides any later SDK/network timeout.
- CCTP attestation/forwarding is polled from Circle Iris (`/v2/messages/{domain}?transactionHash=…`)
  with bounded backoff. 404 / empty / pending responses stay "waiting", never "failed".
- `forwardTxHash` (Arc mint) is captured and rendered as a direct **Arcscan** link.
- Active attempts survive a page reload and resume polling (no wallet signature, no re-burn).
- Recent transfers (history) are listed independently; each attempt keeps its own links/state.
- A **Recover transfer** form accepts a source burn hash and rebuilds the attempt without
  repeating approval or burn.
- A synchronous submission lock + matching-attempt guard blocks duplicate submissions.

---

## A. New transfer test (Preview, dedicated test wallet)

1. Use Preview only. Connect a dedicated test wallet.
2. Select **Ethereum Sepolia** (or Base Sepolia).
3. Choose **Standard / SLOW** (Forwarding Service enabled).
4. Enter a small test USDC amount (e.g. 1 USDC).
5. Click **Estimate bridge** → **Review transfer** → **Confirm & bridge**.
6. In the wallet, approve USDC, then confirm the burn.
7. Confirm the lifecycle panel shows:
   - **Approve USDC** → short hash + copy + source explorer link immediately after wallet approval.
   - **Burn on source** → short hash + copy + source explorer link immediately after burn submission.
   - **Confirming on Ethereum Sepolia** → then **Complete**.
8. Open the source explorer link; verify the burn receipt is `Success`.
9. Reload the page after the burn. Confirm the attempt **restores** and attestation polling resumes.
10. Watch **Circle attestation** → **Forwarded mint on Arc** → **Complete**.
11. Open the **Arcscan** link; verify the destination mint receipt.
12. Verify the Arc recipient balance increased by (amount − forwarding fee).

## B. Recovery test (owner's two existing burns)

The owner already performed two ~1 USDC transfers Sepolia → Arc; source USDC dropped 80 → 78.
Do NOT assume success from the balance change.

1. Find each source burn transaction hash in the wallet or Sepolia explorer.
2. On the Bridge page, click **Recover transfer by burn hash**.
3. Select the correct **source chain** (Ethereum Sepolia).
4. Paste burn hash 1; click **Validate & recover**.
5. Confirm the form validates the receipt, shows **Burn on source → Complete**, and begins
   attestation/forwarding polling. Approval and burn are **not** repeated.
6. When forwarding completes, verify the **Arcscan** link and Arc recipient balance.
7. Repeat independently for burn hash 2. Each recovered transfer remains a **separate attempt**.

## C. Duplicate prevention

1. Start a fresh Standard transfer and open the confirmation dialog.
2. Double-click **Confirm & bridge** rapidly.
3. Verify only **one** wallet approval/burn request occurs.
4. Reload during the wallet delay; verify no duplicate attempt is created.
5. Attempt the same transfer again while unresolved; verify it is blocked with
   "A matching bridge transfer is already in progress."

## D. History

1. After completing transfers, verify **Recent bridge transfers** lists each as a separate attempt.
2. Verify each attempt has independent View progress / Check status / Resume / (Dismiss when complete) controls and its own links.
3. Verify long transaction hashes do not cause horizontal overflow at 320px.

---

## Safety guarantees (no live broadcast)

- No `eth_sendTransaction` / `bridge()` is called automatically on load or on reload.
- Recovery never repeats approval or burn; it only resumes attestation/forwarding checks.
- Retry ("Resume") reuses the verified successful burn and never re-submits it.
- Only public Circle SDK APIs and TypeScript types are used. No frontend Circle API key,
  no server-side private key, no Vercel Cron, no new API function.
