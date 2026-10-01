import Decimal from 'decimal.js';
import {
  fromRaw,
  toRaw,
  type DataAdapter,
  type Market,
  type Policy,
  type Provider,
  type Quote,
  type Representation,
  type Scenario,
} from '../core/domain';
/** FICTIONAL fixtures. These identifiers are intentionally not EVM addresses. */
export const demoEquities = [
  { ticker: 'NVDA', company: 'NVIDIA', price: '180' },
  { ticker: 'AAPL', company: 'Apple', price: '230' },
  { ticker: 'TSLA', company: 'Tesla', price: '340' },
];
export class DemoAdapter implements DataAdapter {
  readonly mode = 'demo' as const;
  constructor(private scenario: Scenario = 'successful-best-execution') {}
  async discover(query: string): Promise<Representation[]> {
    return demoEquities
      .filter(
        (e) =>
          !query ||
          e.ticker === query.toUpperCase() ||
          e.company.toLowerCase() === query.toLowerCase(),
      )
      .flatMap((e) =>
        (['bstocks', 'ondo', 'xstocks'] as Provider[]).map((provider) => ({
          ticker: e.ticker,
          companyName: e.company,
          provider,
          chain: 'bsc',
          tokenAddress: `DEMO:${e.ticker}:${provider}`,
          symbol: e.ticker + { bstocks: 'b', ondo: 'on', xstocks: 'x', unknown: '' }[provider],
          decimals: 18,
          sharesPerToken: '1',
          tradable: true,
          status: 'regular',
          sourceTimestamp: new Date().toISOString(),
          demo: true,
        })),
      );
  }
  async market(r: Representation): Promise<Market> {
    const price = demoEquities.find((e) => e.ticker === r.ticker)!.price;
    return {
      tokenAddress: r.tokenAddress,
      onchainPrice: new Decimal(price)
        .mul(r.provider === 'xstocks' ? '1.024' : r.provider === 'ondo' ? '1.001' : '1.004')
        .toFixed(),
      referencePrice: price,
      onchainTimestamp: new Date().toISOString(),
      referenceTimestamp: new Date(
        Date.now() - (this.scenario === 'stale-reference' ? 64000000 : 30000),
      ).toISOString(),
      referenceSource: 'Fictional demo reference',
      referenceIndependent: true,
      referenceCurrency: 'USD',
      marketStatus: this.scenario === 'stale-reference' ? 'closed' : 'regular',
      observedAt: new Date().toISOString(),
    };
  }
  async quotes(p: Policy, r: Representation): Promise<Quote[]> {
    const m = await this.market(r);
    const out =
      p.side === 'buy'
        ? new Decimal(p.amount).div(m.onchainPrice!)
        : new Decimal(p.amount).mul(m.onchainPrice!);
    const raw = toRaw(out.toFixed(18, Decimal.ROUND_DOWN), 18);
    return [
      {
        id: crypto.randomUUID(),
        vendor: 'Demo venue',
        executionMode: 'SWAP',
        inputToken: p.side === 'buy' ? 'DEMO:USDT' : r.tokenAddress,
        outputToken: p.side === 'buy' ? r.tokenAddress : 'DEMO:USDT',
        amountIn: p.amount,
        inputDecimals: 18,
        amountInRaw: toRaw(p.amount, 18),
        expectedAmountOut: fromRaw(raw, 18),
        amountOutRaw: raw,
        outputDecimals: 18,
        inputPriceUsd: '1',
        outputPriceUsd: '1',
        gasUsd: '0.015',
        slippageBps: p.maxSlippageBps,
        priceImpactBps: 8,
        quotedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30000).toISOString(),
      },
    ];
  }
  async simulate() {
    return {
      success: this.scenario !== 'simulation-failure',
      kind: 'demo' as const,
      error:
        this.scenario === 'simulation-failure'
          ? 'Fictional simulation revert: insufficient USDT.'
          : undefined,
    };
  }
}
