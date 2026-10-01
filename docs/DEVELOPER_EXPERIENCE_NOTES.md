# Developer experience — observed integration evidence

Date: 2026-10-01. These records describe measured behavior, saved responses and code inspection, not invented human interviews. Historical files are snapshots; new requests are required before a trade. Test doubles establish local validation behavior only.

## Public discovery and authenticated coverage

- **Integration:** Binance Wallet Skill / authenticated RWA.
- **Endpoint:** Public `stock/detail/list/ai`, `meta/ai`, `asset/market/status/ai`, `dynamic/ai`; signed `/rwa/tokens` and `/rwa/search`.
- **Task / date:** Discover NVDA on BSC, 2026-10-01.
- **Expected:** Identify issuer-specific representations without treating token quantities as equivalent.
- **Observed / response:** Public discovery returned NVDAon, NVDAx and NVDAB; all ten public requests succeeded. Signed discovery returned NVDAon and NVDAB.
- **Impact:** A public listing does not prove authenticated executable coverage.
- **Workaround:** Preserve source labels and quote each representation independently; never invent a missing route.
- **Suggested improvement:** Explain coverage differences between public discovery and signed trading.
- **Evidence:** [Public snapshot](devex/live-discovery-evidence.json), [signed reads](devex/authenticated-read-evidence.json).

## Market status and source timestamps

- **Integration:** Binance RWA / Market.
- **Endpoint:** `/rwa/underlying-market`, `/rwa/price`; public `dynamic/ai`.
- **Task / date:** Validate NVDA tradability and freshness, 2026-10-01.
- **Expected:** Explicit tradability and timestamps attributable to price sources.
- **Observed / response:** Signed NVDAon was `premarket`; NVDAB normalized to `active`; both were tradable and had token-price source timestamps. Neither read had an independent reference. Public stock indication lacks a validated source timestamp in the implemented schema.
- **Impact:** Token-price freshness cannot establish independent stock-reference freshness. `active` is not a claim that the traditional exchange is open.
- **Workaround:** Keep token price, token-derived value and independent reference separate. Use Alpaca or the independent operator service for the reference gate.
- **Suggested improvement:** Document timestamp provenance for public stock-price fields.
- **Evidence:** [Signed reads](devex/authenticated-read-evidence.json), [public adapter](../packages/market/public.ts).

## Quote lifetime and cost semantics

- **Integration:** Binance Trading.
- **Endpoint:** `/aggregator/quote`, `/aggregator/swap`.
- **Task / date:** Quote a 10 USDT NVDA purchase, 2026-10-01.
- **Expected:** Wallet-bound routes, comparable output and disclosed cost units.
- **Observed / response:** LiquidMesh SWAP quotes returned for NVDAon and NVDAB; precisions were 18, input `10000000000000000000` raw units. Official documentation describes `tradeFee` as estimated network cost in USD and quote-ID TTL as approximately 30 seconds.
- **Impact:** Counting `tradeFee` as another trading commission duplicates network cost; cached quotes cannot authorize fresh execution.
- **Workaround:** Map cost once to `gasUsd`; rank normalized output after cost. Record a conservative 25-second window from request start and refresh after approval and before preparation.
- **Suggested improvement:** Surface explicit per-route expiration and clearer network-fee naming.
- **Evidence:** [Quote/build snapshot](devex/authenticated-quote-evidence.json), [official Trading API](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api#get-aggregated-quote).

## Exact approval and contract provenance

- **Integration:** Binance Trading / BSC JSON-RPC.
- **Endpoint:** `/aggregator/approve-transaction`; bytecode/proxy storage reads.
- **Task / date:** Inspect unsigned approval and router, 2026-10-01.
- **Expected:** Exact-input approval, independently encoded calldata and reviewed provenance.
- **Observed / response:** Calldata matched locally encoded approval for 10 USDT. Spender and built router were `0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5`. Bytecode existed; no recognized proxy marker was found. This does not exclude a custom proxy or establish provenance.
- **Impact:** An API response, bytecode and simulation alone cannot justify granting allowance.
- **Workaround:** Keep the allowlist empty pending source, deployment, implementation and upgrade/admin review.
- **Suggested improvement:** Publish vendor router/spender deployment references and upgrade policies.
- **Evidence:** [Router inspection](devex/router-inspection.json), [approval evidence](devex/authenticated-quote-evidence.json).

## Simulation connectivity versus readiness

- **Integration:** Binance Transaction API.
- **Endpoint:** `/pre-transaction/simulate`.
- **Task / date:** Simulate the exact unsigned SWAP with a random unfunded probe, 2026-10-01.
- **Expected:** API response; funded success requires separate evidence.
- **Observed / response:** The endpoint responded; simulation was `failed`. No funded success or broadcast was observed.
- **Impact:** Successful HTTP/schema validation does not mean successful economic simulation.
- **Workaround:** `verify:quote --simulate --approval` retains evidence but exits nonzero with `READINESS BLOCKED` on simulation failure. Live requires matching simulated debit/credit and no unwanted allowance mutation.
- **Suggested improvement:** Structured simulation-failure categories distinct from API connectivity.
- **Evidence:** [Simulation probe](devex/authenticated-quote-evidence.json), [simulation checks](../packages/market/live.ts).

## Independent reference setup

- **Integration:** Alpaca IEX.
- **Endpoint:** `/v2/stocks/NVDA/trades/latest?feed=iex`; not called with live credentials here.
- **Task / date:** `pnpm verify:reference NVDA`, 2026-10-01.
- **Expected:** Positive USD/share price, exchange and real trade time.
- **Observed / error:** `NOT READY`; missing `ALPACA_API_KEY_ID` and `ALPACA_API_SECRET_KEY`. No live Alpaca price observed.
- **Impact:** Reference/freshness gates remain blocked despite valid Binance quotes.
- **Workaround:** User configures credentials privately, then verifies when the IEX trade can be fresh. Never replace its time with `Date.now()`.
- **Suggested improvement:** Keep missing-variable errors explicit and return source time/age.
- **Evidence:** [Reference CLI](../scripts/verify-reference.ts), [timestamp tests](../tests/reference.test.ts); test responses are synthetic.

## Production runtime and persistence

- **Integration:** Next.js / PostgreSQL / Playwright.
- **Endpoint:** Eight local pages, `/api/health`, `/api/routes/evaluate`, `/api/executions/{receiptId}`.
- **Task / date:** Validate runtime and durability, 2026-10-01.
- **Expected:** Tests independent of an existing development server; persistent session-scoped receipts.
- **Observed / error:** A second `next dev` was rejected while a server existed on port 3000. The production build/server passed the browser suite. PostgreSQL passed repeated migrations, concurrent claims, atomic hash binding, replay rejection and ownership checks.
- **Impact:** Dev locking can cause infrastructure failures. `DATABASE_URL` presence does not establish schema health.
- **Workaround:** Build and use `next start` on port 3100 for E2E. Full schema checks read all required tables. `verify:db` uses a disposable database; `verify:deployment` tests headers and a persistent fictional receipt.
- **Suggested improvement:** Use these checks before deployment and configure shared hosting-level limits.
- **Evidence:** [Playwright](../playwright.config.ts), [DB check](../scripts/verify-db.ts), [runtime check](../scripts/verify-deployment.ts), [final status](FINAL_STATUS.md).

## Agent ecosystem boundaries

- **Integration:** Agentic Wallet / BNB Agent Studio.
- **Endpoint:** Local `baw` bridge / authenticated `runWork` hook.
- **Task / date:** `pnpm wallet status`, `pnpm verify:studio`, 2026-10-01.
- **Expected:** Report setup requirements without invented authorization or deployment.
- **Observed / error:** No `ATLAS_BAW_EXECUTABLE`, `ATLAS_REPORT_URL` or `ATLAS_AGENT_TOKEN`. No authenticated Agentic Wallet or Studio seller verified.
- **Impact:** Prepared integration boundaries, not verified deployments.
- **Workaround:** Official interactive setup; full-policy correspondence checks in the hook, live prohibition and rejection of executed reports. Wallet trades retain `EXECUTE` and official confirmations.
- **Suggested improvement:** Verify an authenticated read and a real Studio task after owner setup.
- **Evidence:** [Studio runbook](AGENT_STUDIO.md), [wallet bridge](../packages/execution/agentic-wallet.ts), [hook tests](../tests/studio.test.ts).
