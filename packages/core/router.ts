import Decimal from 'decimal.js';
import { checkRoute } from './risk';
import { type DataAdapter, type Evaluation, type Receipt, type TradeIntent } from './domain';
export async function evaluateRoutes(
  intent: TradeIntent,
  adapter: DataAdapter,
  wallet?: string,
): Promise<Receipt> {
  const start = performance.now();
  const timeline: Receipt['timeline'] = [
    { label: 'Deterministic policy validated', at: new Date().toISOString(), durationMs: 0 },
  ];
  const reps = await adapter.discover(intent.ticker);
  const tickers = new Set(reps.map((r) => r.ticker));
  if (tickers.size > 1)
    throw new Error('Ambiguous company search. Select an exact ticker from Markets.');
  if (reps[0]) intent = { ...intent, ticker: reps[0].ticker };
  timeline.push({
    label: `${reps.length} BSC representations discovered`,
    at: new Date().toISOString(),
    durationMs: Math.round(performance.now() - start),
  });
  // Three concurrent representations; vendors within a representation evaluated sequentially.
  const candidates: Evaluation[] = [];
  for (let i = 0; i < reps.length; i += 3) {
    const results = await Promise.allSettled(
      reps.slice(i, i + 3).map(async (r) => {
        const begin = performance.now();
        const base: Evaluation = {
          id: crypto.randomUUID(),
          representation: r,
          market: {
            tokenAddress: r.tokenAddress,
            marketStatus: r.status,
            observedAt: new Date().toISOString(),
          },
          checks: [],
          eligible: false,
          rejectionReasons: [],
          durationMs: 0,
        };
        try {
          base.market = await adapter.market(r);
          const quotes = await adapter.quotes(intent, r, wallet);
          if (!quotes.length) throw new Error('No liquidity: no executable quote returned.');
          const evaluated: Evaluation[] = [];
          for (const q of quotes) {
            const e: Evaluation = { ...base, id: crypto.randomUUID(), quote: q };
            const shares = new Decimal(q.expectedAmountOut).mul(r.sharesPerToken);
            if (intent.side === 'buy') {
              e.grossShares = shares.toFixed();
              e.executionPrice = new Decimal(intent.amount)
                .mul(q.inputPriceUsd)
                .div(shares)
                .toFixed();
              if (q.gasUsd !== undefined && e.market.referencePrice)
                e.netOutput = shares
                  .minus(new Decimal(q.gasUsd).div(e.market.referencePrice))
                  .toFixed();
            } else {
              e.executionPrice = new Decimal(q.expectedAmountOut)
                .mul(q.outputPriceUsd)
                .div(new Decimal(intent.amount).mul(r.sharesPerToken))
                .toFixed();
              if (q.gasUsd !== undefined)
                e.netOutput = new Decimal(q.expectedAmountOut)
                  .minus(new Decimal(q.gasUsd).div(q.outputPriceUsd))
                  .toFixed();
            }
            if (intent.executionMode !== 'quote') {
              try {
                e.simulation = await adapter.simulate(intent, r, q, wallet);
              } catch {
                e.simulation = {
                  success: false,
                  kind: 'unavailable',
                  error: 'Transaction simulation unavailable. This route is excluded.',
                };
              }
            }
            e.checks = checkRoute(intent, e);
            e.rejectionReasons = e.checks
              .filter((c) => c.status === 'fail')
              .map((c) => `${c.label}: ${c.explanation}`);
            e.eligible =
              e.rejectionReasons.length === 0 &&
              e.netOutput !== undefined &&
              new Decimal(e.netOutput).gt(0);
            if (!e.eligible && !e.rejectionReasons.length)
              e.rejectionReasons.push('Net output is not positive.');
            e.durationMs = Math.round(performance.now() - begin);
            evaluated.push(e);
          }
          return evaluated;
        } catch (error) {
          base.rejectionReasons = [error instanceof Error ? error.message : 'Candidate failed'];
          base.checks = [
            {
              code: 'ADAPTER',
              label: 'Route data',
              status: 'fail',
              explanation: base.rejectionReasons[0],
            },
          ];
          base.durationMs = Math.round(performance.now() - begin);
          return [base];
        }
      }),
    );
    for (const result of results)
      if (result.status === 'fulfilled') candidates.push(...result.value);
  }
  // Earlier quotes may have expired while another candidate was being simulated.
  for (const e of candidates) {
    if (e.quote) {
      e.checks = checkRoute(intent, e);
      e.rejectionReasons = e.checks
        .filter((c) => c.status === 'fail')
        .map((c) => `${c.label}: ${c.explanation}`);
      e.eligible =
        e.rejectionReasons.length === 0 &&
        e.netOutput !== undefined &&
        new Decimal(e.netOutput).gt(0);
    }
  }
  const valid = candidates
    .filter((e) => e.eligible)
    .sort((a, b) => new Decimal(b.netOutput!).cmp(a.netOutput!));
  timeline.push({
    label: `${candidates.filter((c) => c.quote).length} quotes · ${candidates.filter((c) => c.simulation?.success).length} simulations passed · ${valid.length} eligible routes`,
    at: new Date().toISOString(),
    durationMs: Math.round(performance.now() - start),
  });
  const winner = valid[0];
  return {
    id: crypto.randomUUID(),
    intent,
    dataMode: adapter.mode,
    candidates,
    selectedRouteId: winner?.id,
    decision: winner ? 'approved' : 'blocked',
    executed: false,
    status: winner ? (intent.executionMode === 'quote' ? 'quoted' : 'simulated') : 'blocked',
    reason: winner
      ? `Highest valid net ${intent.side === 'buy' ? 'underlying share exposure' : 'USDT proceeds'} after estimated gas, under your policy.`
      : reps.length
        ? 'No route passed all required checks. Funds were not moved.'
        : 'No supported BSC tokenized representation was found.',
    createdAt: new Date().toISOString(),
    timeline,
  };
}
