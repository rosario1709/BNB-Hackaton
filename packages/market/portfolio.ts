import Decimal from 'decimal.js';
import type { Representation } from '../core/domain';
export function summarizePortfolio(
  assets: { symbol: string; balance: string; tokenPrice: string; tokenContractAddress: string }[],
  representations: Representation[],
) {
  const holdings = assets.flatMap((a) => {
    const r = representations.find(
      (r) => r.tokenAddress.toLowerCase() === a.tokenContractAddress.toLowerCase(),
    );
    if (!r) return [];
    return [
      {
        ...a,
        ticker: r.ticker,
        provider: r.provider,
        underlyingShares: new Decimal(a.balance).mul(r.sharesPerToken).toFixed(),
        valueUsd: new Decimal(a.balance).mul(a.tokenPrice).toFixed(),
      },
    ];
  });
  const distribution = Object.entries(
    holdings.reduce<Record<string, Decimal>>((acc, h) => {
      acc[h.provider] = (acc[h.provider] ?? new Decimal(0)).plus(h.valueUsd);
      return acc;
    }, {}),
  ).map(([provider, value]) => ({ provider, valueUsd: value.toFixed() }));
  return {
    holdings,
    distribution,
    totalEquityUsd: holdings.reduce((sum, h) => sum.plus(h.valueUsd), new Decimal(0)).toFixed(),
  };
}
