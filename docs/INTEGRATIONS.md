# Integration verification ledger

Documentation inspected 2026-09-29. Source of truth is the official schema and official skill repository, not third-party contract lists.

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

## RFQ and approvals

The current official Trading introduction distinguishes mixed SWAP/RFQ bStocks routes, RFQ Ondo routes, and AMM xStocks routes. Some per-endpoint text still says all equities use RFQ; ATLAS uses the returned `executionMode` rather than inferring it from issuer.

RFQ typed-data signatures are not EVM transaction simulations. This version preserves RFQ quote evidence and explains why simulation/execution is unavailable. It never signs an unverified settlement. For SWAP, existing allowance is required; a revert caused by missing approval blocks execution. Automatic token approval and RFQ submission are remaining implementation work, not missing credentials alone.

## B402 investigation

The official V2 routes are `POST /api/v2/b402/supported`, `/verify`, and `/settle`. They have a different business envelope from the market/trading APIs. Configurations are returned for the authenticated portal project; payment requirement extras must come from that response. Verification is not settlement. This repository does not sell reports or claim payment integration. The intelligence endpoint is bearer-authenticated and free to call when configured.
