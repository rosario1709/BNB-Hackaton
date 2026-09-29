# Fixtures

`official-shape/quote.json` is a synthetic test response matching the official Trading API schema read on 2026-09-29. Contract addresses are test identifiers, not listed stock tokens. Source: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api#get-aggregated-quote

Demo scenario fixtures live in `packages/market/demo.ts`, are explicitly fictional, and use non-address `DEMO:` identifiers. They are never substituted after a live API error.

Live public discovery evidence is recorded separately under `docs/devex/` with retrieval time and no authentication data.
