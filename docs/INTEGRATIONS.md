# Integration verification ledger

Binance documentation inspected 2026-09-29; Alpaca reference documentation inspected 2026-09-30. Sources of truth are the official schemas and skill repositories.

| Capability        | Method / path                                           | Authentication | Request / response evidence                                                                |
| ----------------- | ------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------ |
| Token list        | GET `/api/v1/dex/market/rwa/tokens`                     | X-OC headers   | `binanceChainId=56`; array with underlying ticker, provider, decimals, share ratio, status |
| Search            | GET `/api/v1/dex/market/rwa/search`                     | X-OC headers   | `keyword`; grouped ticker/asset records; filter assets by BSC                              |
| Prices            | GET `/api/v1/dex/market/rwa/price`                      | X-OC headers   | `binanceChainId`, `tokenContractAddresses`; token and token-derived per-share prices       |
| Underlying market | GET `/api/v1/dex/market/rwa/underlying-market`          | X-OC headers   | BSC and token address; asset status and market data                                        |
| Quote             | GET `/api/v1/dex/aggregator/quote`                      | X-OC headers   | Raw amount, from/to contracts, receiver; vendor route array                                |
| Build             | GET `/api/v1/dex/aggregator/swap`                       | X-OC headers   | Quote ID and exact quote parameters; SWAP transaction or RFQ typed data                    |
| Simulate          | POST `/api/v1/dex/pre-transaction/simulate`             | X-OC headers   | `{binanceChainId:"56",evmTx:{from,to,value,data}}`; status, balance changes, allowances    |
| Wallet            | GET `/api/v1/dex/balance/all-token-balances-by-address` | X-OC headers   | Address, `chains=56`, page, pageSize; tokenAssets decimal balances                         |

Base URL: `https://web3.binance.com/build`. Sign Base64 HMAC-SHA256 of `timestamp + METHOD + /build/path?encodedQuery + rawBody`. ISO timestamp and a fresh nonce are generated per attempt. HTTP status and envelope business code are both checked. Requests time out; retry is bounded; long Retry-After responses are surfaced without busy retry. No signed-order submission or broadcast endpoint is exposed through this generic client.

Sources:

- [Authentication](https://web3.binance.com/en/dev-docs/authentication)
- [OpenAPI schema](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/1.0.0/schema.json)
- [RWA data](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data)
- [Trading](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api)
- [Simulation](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/transaction-api)
- [Wallet](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/wallet-api)
- [Wallet Skill source](https://github.com/binance/binance-skills-hub/tree/main/skills/binance-web3/binance-tokenized-securities-info)
- [B402 V2](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/b402-payments)

## Public market data

The documented Wallet Skill uses public `www.binance.com/bapi/defi/...` endpoints, not invented variants of the signed API. ATLAS implements the token list, meta, asset status, and dynamic V2 paths exactly as documented. All contract addresses are discovered from the list. BSC entries are validated only after filtering other chains: Solana entries are not EVM addresses.

Runtime observations on 2026-09-29: the public list contained provider types 1, 2, and 3 (Ondo, xStocks, bStocks) even though the inspected skill text still described only type 1. Returned metadata names and the current Trading API's type mapping corroborate these provider labels. The `d` decimals field and `assetType` were captured in live responses. Public asset status sometimes returned `marketStatus=null` with `openState=true` and `reasonCode=TRADING`; ATLAS labels tradability active, without claiming a traditional-market session.

Public NVDA discovery was reverified on 2026-09-30; all ten public requests succeeded. The timestamped response snapshot is in `docs/devex/live-discovery-evidence.json`.

Authenticated RWA search, token list, underlying market, and price reads succeeded for NVDAon and NVDAB on 2026-09-30. The sanitized call evidence is in `docs/devex/authenticated-read-evidence.json`. Authenticated Trading quotes succeeded for both representations using a random, unfunded probe address and the [BSC-USD contract and 18 decimals shown by BscScan](https://bscscan.com/token/0x55d398326f99059ff775485246999027b3197955). The SWAP builder and Transaction API simulation endpoints also responded; the simulation failed with that unfunded probe address. The sanitized result is in `docs/devex/authenticated-quote-evidence.json`. These probes did not sign or broadcast a transaction. The shell probe did not change the configured USDT settings.

The unsigned SWAP builder returned router `0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5`; BSC RPC chain ID was 56 and contract code was present. The same address appeared as `approveTarget` for both wallet-bound NVDA quotes. Binance's signed approval endpoint returned calldata for exactly 10 USDT, and ATLAS independently encoded the same spender and amount. The [Sourcify v2 contract lookup](https://docs.sourcify.dev/docs/api/) returned no verified record for this BSC address on 2026-09-30; its contract provenance remains unconfirmed. This is a candidate for operator review, not an automatically approved router or spender. Live execution and approval still require an explicit `ATLAS_ALLOWED_ROUTERS` entry.

Run `pnpm verify:authenticated` for signed read checks. With `ATLAS_USDT_ADDRESS` and `ATLAS_USDT_DECIMALS` set from an operator-reviewed contract, run `pnpm verify:quote --simulate`. The latter uses a random unfunded address unless `ATLAS_QUOTE_PROBE_WALLET` is set. It never signs or broadcasts.

Public discovery uses exact tickers/symbols and caches the list for 60 seconds. Browsing is bounded to 30 representations per public request. The authenticated resolver supports company-name search. Public dynamic stock prices have no documented source timestamp, so they can be displayed but cannot satisfy the freshness check for execution. No response timestamp is substituted for market timestamp.

## Independent reference service contract

`ATLAS_REFERENCE_URL` is **an ATLAS-owned integration contract**, not an alleged Binance endpoint. Provide your own licensed data service at an HTTPS URL. ATLAS appends `?ticker=NVDA` (preserving existing query parameters), sends an optional bearer `ATLAS_REFERENCE_TOKEN`, and validates:

```json
{
  "ticker": "NVDA",
  "currency": "USD",
  "price": "230.825",
  "timestamp": "2026-09-29T10:11:00.000Z",
  "source": "Your licensed exchange reference feed",
  "independent": true
}
```

The example is a schema illustration, not a current quote. Use the price-source timestamp, never request time. Prices must be positive decimal strings and refer to one underlying share. The operator is responsible for selecting a genuinely independent source. Without it, the signed RWA adapter fails the independent-reference/freshness policy closed.

An optional built-in adapter uses [Alpaca's latest single-stock trade API](https://docs.alpaca.markets/us/reference/stocklatesttradesingle-1) with `feed=iex` and USD prices. Set `ALPACA_API_KEY_ID` and `ALPACA_API_SECRET_KEY` to use it when `ATLAS_REFERENCE_URL` is unset. ATLAS checks the returned symbol and IEX exchange code, uses the trade's `t` timestamp, and lets the normal freshness policy reject old trades. [Alpaca's market-data FAQ](https://docs.alpaca.markets/us/docs/market-data-faq) documents the IEX feed and trade timestamp. A configured custom reference URL takes precedence. The operator must confirm the chosen data subscription and permitted use; no Alpaca credentials or successful live call are present in this workspace.

## RFQ and approvals

The current official Trading introduction distinguishes mixed SWAP/RFQ bStocks routes, RFQ Ondo routes, and AMM xStocks routes. Some per-endpoint text still says all equities use RFQ; ATLAS uses the returned `executionMode` rather than inferring it from issuer.

RFQ typed-data signatures are not EVM transaction simulations. This version preserves RFQ quote evidence and explains why simulation/execution is unavailable. It never signs an unverified settlement. For SWAP, ATLAS can prepare an exact-input ERC-20 approval after a fresh quote passes every non-simulation policy check. It compares Binance's approval calldata with a locally encoded `approve(spender, amount)`, requires an operator-approved spender with code on BSC, checks balance and gas, and asks the browser wallet to confirm separately. Once mined, a new quote and simulation are required before the SWAP. No allowance is granted automatically; RFQ settlement remains unsupported.

## B402 investigation

The official V2 routes are `POST /api/v2/b402/supported`, `/verify`, and `/settle`. They have a different business envelope from the market/trading APIs. Configurations are returned for the authenticated portal project; payment requirement extras must come from that response. Verification is not settlement. This repository does not sell reports or claim payment integration. The intelligence endpoint is bearer-authenticated and free to call when configured.
