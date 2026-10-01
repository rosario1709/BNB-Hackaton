# First real trade: NVDA for 10 USDT

Status: **READY FOR USER ACTION**. **NO VERIFIED MAINNET TRADE RECORDED YET.**

ATLAS evaluates and prepares. The user's wallet signs. The assistant must not approve funds, sign, import a wallet or submit a transaction for the user.

## Preconditions

Binance Web3 credentials, both Alpaca IEX credentials (or a configured independent HTTPS feed), migrated PostgreSQL, a BSC wallet with at least 10 USDT and BNB for approval plus swap gas, a verified USDT contract/precision, and operator-reviewed router/spender addresses. The historical user-wallet check on 2026-09-30 returned zero USDT and zero BNB; repeat it with the intended public address. The newer random-address probe only verifies tooling and cannot establish the user's current balance. Never send a private key or seed phrase to ATLAS.

Configure private values only in root `.env.local` or the hosting provider's server environment. Keep `ATLAS_LIVE_TRADING_ENABLED=false` during preparation. `ATLAS_ALLOWED_ROUTERS` has no default and must not be populated merely because Binance returned a contract or bytecode exists.

## Read-only verification

Run from the repository root. In the observed Windows environment, Node needed the system trust store for RPC verification:

```powershell
$env:NODE_OPTIONS='--use-system-ca'
pnpm db:migrate
pnpm verify:authenticated
pnpm verify:reference NVDA
pnpm verify:wallet <PUBLIC_ADDRESS> 10 <REVIEWED_SPENDER>
pnpm verify:quote --simulate --approval
pnpm inspect:router <ROUTER> <SPENDER>
pnpm verify:production
```

Replace angle-bracket placeholders before running. Set `ATLAS_QUOTE_PROBE_WALLET` only to the public wallet address when probing the intended wallet; otherwise `verify:quote` generates a random unfunded address. None of these commands signs or broadcasts.

Expected: real RWA/Market reads, `freshForDefaultPolicy=true`, on-chain decimals matching configuration, sufficient token/gas balances, exact approval calldata, and a route that can be simulated after allowance exists. `INSUFFICIENT_ALLOWANCE` is expected before the separate approval step; an unfunded or unapproved simulation is not proof of a working trade. Wallet `READY` uses a disclosed 600,000-gas budget plus 20%; preparation still estimates the actual transaction. `verify:production` returns nonzero while required configuration or live enablement is missing, as intended.

Review [router-inspection.json](devex/router-inspection.json). Confirm official deployment/provenance, source/implementation and upgrade permissions, vendor, tokenIn/tokenOut, spender and built router. EIP-1967 and EIP-1167 marker inspection cannot rule out a custom proxy or prove safety. Record the review externally and only then enter the reviewed addresses in `ATLAS_ALLOWED_ROUTERS`.

## Browser flow

1. After prerequisites pass, deliberately set `ATLAS_DEMO_MODE=false`, `ATLAS_LIVE_TRADING_ENABLED=true`, and `ATLAS_MAX_TRADE_USDT=10`; restart the web server. No code in the project toggles these automatically.
2. Open `/trade`, connect MetaMask and select BSC mainnet (`56`, `0x38`). Check the full wallet address shown in the review. ATLAS rechecks the current account and chain before each signing request.
3. Enter `Buy $10 of NVIDIA. Maximum slippage 0.5%. Maximum reference deviation 1%.` Review the compiled policy, use mode `live`, and re-evaluate. Keep `allowWhenReferenceStale=false`; the default reference age is 300 seconds.
4. Inspect all candidates, share multipliers, independent reference, source time, executable price, fee, slippage/impact, normalized output and checks. A rejection is actionable evidence; do not weaken a check just to make the trade pass.
5. If only simulation is blocking a SWAP and allowance may be missing, click **Check exact approval**. Review token, spender and exact 10 USDT input. The checkbox explains that this transaction only grants allowance. The user confirms MetaMask, then clicks **Check approval confirmation** after mining.
6. The server verifies approval sender/target/value/calldata and the on-chain allowance, persists evidence, and returns the original policy. The browser discards the old route and repeats discovery, market, reference, quotes, normalization, build, simulation and checks.
7. Once a fresh route passes, review it and confirm the trade separately. The server rechecks policy, router/spender, bytecode, real token decimals, allowance, balances, gas and quote expiry, then claims the intent once in PostgreSQL. **READY FOR USER CONFIRMATION** means MetaMask will show this single unsigned SWAP for the user's final approval.
8. After the user signs, ATLAS receives the hash and verifies BSC. Wait for `status=confirmed` **and** `verification=passed`; inspect block, exact input debit, minimum output credit, relevant Transfer logs and BscScan. Export the JSON receipt. Approval evidence travels with the new trade receipt.

## Stop and recovery rules

- A declined wallet confirmation does not broadcast. An execution claim remains reserved: inspect the wallet activity before creating a new intent. Do not resubmit a claim blindly.
- A pending transaction must be checked in `/receipts`, including after a page reload. An RPC failure is reported as unavailable; it is not silently treated as a mined or successful transaction.
- `reverted` or `verification=mismatch` requires review; confirmed EVM status alone does not mean a correct trade. ATLAS stores a wallet review hold in PostgreSQL and blocks new preparations.
- After an operator has investigated and reconciled the exact transaction and balances, the operator may remove only that wallet's row from `execution_holds` using their database administration tool. There is no public endpoint or automatic reset for this hold.
- Each operation requires a new quote/reference/simulation. Do not reuse historical quote IDs from `docs/devex/`.
- Each execution binds atomically to one transaction hash in PostgreSQL. A different hash for the same execution, or the same hash for a different execution, is rejected. Keep the hash returned by MetaMask; never overwrite it with a replacement without operator review.
- A sender, target, value or calldata mismatch also creates a review hold. A successful mined transaction still reports `verification=mismatch` with the exact failing fields. Investigate it before clearing the hold.

## Evidence to preserve after the user's first trade

Export the final receipt: timestamp, intent/policy, representation/vendor, quote and reference, simulation, approval hash if any, swap hash, block, input debit, output credit and verification. Keep secrets out of the artifact. Add the actual BscScan link to the README only after successful verification. Current evidence covers reads, quotes and construction; it does not contain a completed mainnet trade.
