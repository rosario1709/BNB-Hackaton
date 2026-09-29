import { it, expect } from 'vitest';
import { summarizePortfolio } from '../packages/market/portfolio';
import { DemoAdapter } from '../packages/market/demo';
it('normalizes holdings and aggregates provider value without Number precision loss', async () => {
  const reps = await new DemoAdapter().discover('NVDA');
  reps[0].sharesPerToken = '2';
  const result = summarizePortfolio(
    [
      {
        symbol: 'NVDAb',
        balance: '0.100000000000000001',
        tokenPrice: '360',
        tokenContractAddress: reps[0].tokenAddress,
      },
      { symbol: 'UNRELATED', balance: '500', tokenPrice: '1', tokenContractAddress: 'DEMO:OTHER' },
    ],
    reps,
  );
  expect(result.holdings).toHaveLength(1);
  expect(result.holdings[0].underlyingShares).toBe('0.200000000000000002');
  expect(result.totalEquityUsd).toBe('36.00000000000000036');
});
