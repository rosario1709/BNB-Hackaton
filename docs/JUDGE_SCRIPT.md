# Three-minute judge demonstration

Before presenting: open `/judge`, `/markets`, `/receipts` and `/system`. Use `ATLAS_DEMO_MODE=true`, `ATLAS_LIVE_TRADING_ENABLED=false` for a reproducible presentation without spending. Public discovery remains available separately. If demonstrating live data, label it and use the actual results; never substitute fictional candidates after an API failure. Do not try to complete two wallet transactions inside a timed pitch.

On `/judge`, **Fictional demo** explicitly selects the four fictional scenarios even when the server has Binance credentials. **Configured data** uses actual adapters. The fictional multipliers are deliberately different: Ondo 2, bStocks 1, xStocks 0.5 shares/token. The winner receives fewer tokens than the valid alternative but greater normalized net stock exposure. These multipliers describe the demo, not actual issuers.

| Time | Action and words to say |
| --- | --- |
| 0:00–0:20 | Show the ATLAS hero. **“NVDA is not necessarily one token on-chain. Multiple issuers can represent the same underlying stock using different token units and execution routes.”** |
| 0:20–0:40 | Show the intent: **“Buy $10 of NVIDIA. Maximum slippage 0.5%. Maximum reference deviation 1%.”** Point to the editable limits. Say **“The user has already chosen the investment and the amount.”** |
| 0:40–1:20 | Select **Best execution** and **Simulate routes**. Say **“These are clearly marked DEMO DATA scenarios; no funds move. ATLAS normalizes every representation into underlying stock exposure.”** Point to Ondo, bStocks and xStocks, shares/token, normalized shares, costs and net output. Public Markets discovery can show actual listed contracts; authenticated quotes may cover a different subset. |
| 1:20–1:55 | Expand the rejected route's checks. Show reference/source time, deviation and simulation. Say **“This route failed the user's limit. A token-derived price is not an independent stock reference. In live mode, missing or stale evidence blocks the route.”** The demo reference is fictional; Alpaca must be configured and live-tested before claiming a real independent quote. |
| 1:55–2:30 | Point to **WHY THIS ROUTE WON** and the winning net exposure. Say **“ATLAS is not choosing what to invest in. It is choosing how to execute an intent the user already provided.”** Optionally select **Policy block** to show a refusal and its receipt. |
| 2:30–2:50 | If a real verified trade exists, show its BscScan transaction and receipt with `confirmed` plus `verification=passed`, exact input debit and output. Otherwise point to **NO VERIFIED MAINNET TRADE RECORDED YET** and say **“Real reads, quotes and exact approval construction are verified. Wallet funding, the independent feed and operator router approval remain required before the user signs.”** |
| 2:50–3:00 | Close: **“ATLAS evaluates and prepares. The user's wallet signs. One intent. Every market. Best execution.”** |

For follow-up questions: `/system` separates configuration from measured API responses; `/receipts` exports full evidence; `/agent` demonstrates a bearer-authenticated report API. RFQ execution, Studio deployment/identity and b402 payments are not claimed. The additional **Stale reference** and **Simulation failure** scenarios are available on `/judge` and `/trade`.
