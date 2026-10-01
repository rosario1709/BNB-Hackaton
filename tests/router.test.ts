import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { DemoAdapter } from '../packages/market/demo';
import { evaluateRoutes } from '../packages/core/router';
import {
  policySchema,
  type TradeIntent,
  type DataAdapter,
  type Policy,
  type Representation,
} from '../packages/core/domain';
import { checkRoute } from '../packages/core/risk';
const intent = (overrides: Partial<Policy> = {}): TradeIntent => ({
  ...policySchema.parse({ ticker: 'NVDA', amount: '10', ...overrides }),
  id: crypto.randomUUID(),
  createdAt: new Date().toISOString(),
});
describe('Router and deterministic risk', () => {
  it('chooses highest valid net exposure and rejects better unsafe quote', async () => {
    const r = await evaluateRoutes(intent(), new DemoAdapter());
    expect(r.decision).toBe('approved');
    expect(r.candidates.filter((c) => c.eligible)).toHaveLength(2);
    expect(r.candidates.find((c) => c.id === r.selectedRouteId)?.representation.provider).toBe(
      'ondo',
    );
    expect(
      r.candidates
        .find((c) => c.representation.provider === 'xstocks')
        ?.checks.find((c) => c.code === 'DEVIATION')?.status,
    ).toBe('fail');
    expect(r.executed).toBe(false);
  });
  it('strict reference policy blocks all', async () => {
    const r = await evaluateRoutes(intent({ maxReferenceDeviationBps: 1 }), new DemoAdapter());
    expect(r.decision).toBe('blocked');
    expect(r.selectedRouteId).toBeUndefined();
  });
  it('stale reference blocks when forbidden', async () => {
    const r = await evaluateRoutes(intent(), new DemoAdapter('stale-reference'));
    expect(r.decision).toBe('blocked');
    expect(r.candidates[0].checks.find((c) => c.code === 'FRESHNESS')?.status).toBe('fail');
  });
  it('stale opt-in preserves deviation checks', async () => {
    const r = await evaluateRoutes(
      intent({ allowWhenReferenceStale: true }),
      new DemoAdapter('stale-reference'),
    );
    expect(r.decision).toBe('approved');
    expect(r.candidates.find((c) => c.representation.provider === 'xstocks')?.eligible).toBe(false);
  });
  it('failed simulations block', async () =>
    expect((await evaluateRoutes(intent(), new DemoAdapter('simulation-failure'))).decision).toBe(
      'blocked',
    ));
  it('rejects halted status regardless of capitalization', async () => {
    const report = await evaluateRoutes(intent(), new DemoAdapter());
    const selected = report.candidates.find(
      (candidate) => candidate.id === report.selectedRouteId,
    )!;
    selected.representation.status = 'HALTED';
    expect(
      checkRoute(report.intent, selected).find((check) => check.code === 'TRADABLE')?.status,
    ).toBe('fail');
  });
  it('quote mode never simulates', async () => {
    const a = new DemoAdapter();
    a.simulate = () => {
      throw new Error('MUST NOT CALL');
    };
    const r = await evaluateRoutes(intent({ executionMode: 'quote' }), a);
    expect(r.status).toBe('quoted');
    expect(r.candidates.every((c) => !c.simulation)).toBe(true);
  });
  it('retains quotes with a missing independent reference without bypassing price checks', async () => {
    const a = new DemoAdapter(), original = a.market.bind(a);
    a.market = async (r) => ({ ...await original(r), referencePrice: undefined,
      referenceTimestamp: undefined, referenceIndependent: false, referenceError: 'Independent reference missing.' });
    a.simulate = () => { throw new Error('MUST NOT CALL'); };
    const r = await evaluateRoutes(intent({ executionMode: 'quote', allowWhenReferenceStale: true }), a);
    expect(r.decision).toBe('blocked');
    expect(r.selectedRouteId).toBeUndefined();
    expect(r.candidates).toHaveLength(3);
    for (const candidate of r.candidates) {
      expect(candidate.quote).toBeDefined();
      expect(candidate.netOutput).toBeUndefined();
      expect(candidate.simulation).toBeUndefined();
      expect(candidate.checks.filter((c) => c.status === 'fail').map((c) => c.code))
        .toEqual(['REFERENCE', 'FRESHNESS', 'DEVIATION']);
      expect(candidate.checks.some((c) => c.code === 'SIMULATION')).toBe(false);
    }
  });
  it('unknown ticker yields an honest blocked receipt', async () =>
    expect(
      (await evaluateRoutes(intent({ ticker: 'NO_SUCH_TICKER' }), new DemoAdapter())).reason,
    ).toMatch('No supported BSC'));
  it('one provider outage does not suppress other candidates', async () => {
    const a = new DemoAdapter(),
      original = a.quotes.bind(a);
    a.quotes = async (p: Policy, r: Representation) => {
      if (r.provider === 'ondo') throw new Error('Quote unavailable');
      return original(p, r);
    };
    const r = await evaluateRoutes(intent(), a);
    expect(r.candidates).toHaveLength(3);
    expect(r.candidates.find((c) => c.id === r.selectedRouteId)?.representation.provider).toBe(
      'bstocks',
    );
  });
  it('normalizes token share multipliers instead of ranking token quantities', async () => {
    const r = await evaluateRoutes(intent(), new DemoAdapter());
    const winner = r.candidates.find((c) => c.id === r.selectedRouteId)!;
    const alternative = r.candidates.find((c) => c.representation.provider === 'bstocks')!;
    expect(winner.representation.provider).toBe('ondo');
    expect(winner.representation.sharesPerToken).toBe('2');
    expect(new Decimal(winner.quote!.expectedAmountOut).lt(alternative.quote!.expectedAmountOut)).toBe(true);
    expect(new Decimal(winner.netOutput!).gt(alternative.netOutput!)).toBe(true);
  });
  it('sell policy never swaps a different holding', async () => {
    const r = await evaluateRoutes(
      intent({
        side: 'sell',
        denomination: 'TOKEN',
        amount: '0.05',
        sellTokenAddress: '0x1111111111111111111111111111111111111111',
      }),
      new DemoAdapter(),
    );
    expect(r.decision).toBe('blocked');
  });
  it.each([
    'slippage',
    'impact',
    'halt',
    'missing-reference',
    'public-reference',
    'stale-onchain',
    'future-reference',
    'simulation',
    'expired-quote',
    'stale-quote',
    'missing-gas',
  ] as const)('rejects %s', async (failure) => {
    const p = intent(),
      r = await evaluateRoutes(p, new DemoAdapter()),
      e = r.candidates.find((c) => c.eligible)!;
    if (failure === 'slippage') e.quote!.slippageBps = 51;
    if (failure === 'impact') e.quote!.priceImpactBps = 51;
    if (failure === 'halt') {
      e.representation.status = 'pause';
      e.representation.tradable = false;
    }
    if (failure === 'missing-reference') e.market.referencePrice = undefined;
    if (failure === 'public-reference') e.market.referenceIndependent = false;
    if (failure === 'stale-onchain') e.market.onchainTimestamp = new Date(Date.now() - 121000).toISOString();
    if (failure === 'future-reference')
      e.market.referenceTimestamp = new Date(Date.now() + 60000).toISOString();
    if (failure === 'simulation') e.simulation!.success = false;
    if (failure === 'expired-quote') e.quote!.expiresAt = new Date(0).toISOString();
    if (failure === 'stale-quote') e.quote!.quotedAt = new Date(Date.now() - 31000).toISOString();
    if (failure === 'missing-gas') e.quote!.gasUsd = undefined;
    expect(checkRoute(p, e).some((c) => c.status === 'fail')).toBe(true);
  });
  it('excludes ambiguously resolved equities', async () => {
    const demo = new DemoAdapter();
    const a: DataAdapter = {
      mode: 'demo',
      discover: () => demo.discover(''),
      market: demo.market.bind(demo),
      quotes: demo.quotes.bind(demo),
      simulate: demo.simulate.bind(demo),
    };
    await expect(evaluateRoutes(intent(), a)).rejects.toThrow('Ambiguous');
  });
});
