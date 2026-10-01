import Decimal from 'decimal.js';
import { deviationBps, type Evaluation, type Policy, type RiskCheck } from './domain';
export function checkRoute(p: Policy, e: Evaluation, now = Date.now()): RiskCheck[] {
  const r = e.representation,
    m = e.market,
    q = e.quote;
  const check = (
    code: string,
    label: string,
    pass: boolean,
    explanation: string,
    observed?: string | number,
    threshold?: string | number,
  ): RiskCheck => ({
    code,
    label,
    status: pass ? 'pass' : 'fail',
    explanation,
    observed,
    threshold,
  });
  const age = m.referenceTimestamp ? (now - Date.parse(m.referenceTimestamp)) / 1000 : NaN;
  const onchainAge = m.onchainTimestamp ? (now - Date.parse(m.onchainTimestamp)) / 1000 : NaN;
  const price = m.onchainPrice
    ? new Decimal(m.onchainPrice).div(r.sharesPerToken).toFixed()
    : undefined;
  const spotDev = deviationBps(price, m.referencePrice);
  const executionDev = deviationBps(e.executionPrice, m.referencePrice);
  const dev =
    spotDev !== undefined && executionDev !== undefined
      ? Math.max(spotDev, executionDev)
      : undefined;
  e.deviationBps = dev;
  return [
    check(
      'ONCHAIN_FRESHNESS',
      'On-chain price freshness',
      Number.isFinite(onchainAge) && onchainAge >= -5 && onchainAge <= 120,
      'The token price must have a source timestamp no older than 120 seconds.',
      Number.isFinite(onchainAge) ? Math.round(onchainAge) : 'Unknown',
      120,
    ),
    check(
      'TRADABLE',
      'Trading status',
      r.tradable && !['', 'pause', 'halted', 'paused', 'unknown'].includes(r.status.toLowerCase()),
      'Only representations with a verified tradable status pass.',
      r.status,
    ),
    check(
      'REFERENCE',
      'Independent reference',
      m.referenceIndependent === true && !!m.referencePrice && new Decimal(m.referencePrice).gt(0),
      m.referenceError ?? 'An independent per-share price is required; token-derived or unverified public prices cannot satisfy this check.',
      m.referenceSource ?? 'Missing',
    ),
    check(
      'FRESHNESS',
      'Reference freshness',
      Number.isFinite(age) &&
        age >= -5 &&
        (age <= p.maxReferenceAgeSeconds || p.allowWhenReferenceStale),
      'Missing or future timestamps block. Old references require explicit opt-in.',
      Number.isFinite(age) ? Math.round(age) : 'Unknown',
      p.maxReferenceAgeSeconds,
    ),
    check(
      'DEVIATION',
      'Reference deviation',
      dev !== undefined && dev <= p.maxReferenceDeviationBps,
      'Maximum of spot and quoted execution deviation, normalized per underlying share.',
      dev ?? 'Unknown',
      p.maxReferenceDeviationBps,
    ),
    check(
      'QUOTE',
      'Executable quote',
      !!q && new Decimal(q.expectedAmountOut).gt(0),
      'A positive output quote is required.',
    ),
    check(
      'QUOTE_FRESH',
      'Quote freshness',
      !!q && Date.parse(q.expiresAt) > now && Date.parse(q.quotedAt) <= now + 5000,
      'Quotes expire; every live submission needs fresh evidence.',
    ),
    check(
      'SLIPPAGE',
      'Slippage limit',
      !!q && q.slippageBps <= p.maxSlippageBps,
      'Configured maximum slippage; this is a limit, not a prediction.',
      q?.slippageBps ?? 'Unknown',
      p.maxSlippageBps,
    ),
    check(
      'IMPACT',
      'Price impact',
      q?.priceImpactBps !== undefined && q.priceImpactBps <= p.maxSlippageBps,
      'Unknown or excessive price impact blocks the route.',
      q?.priceImpactBps ?? 'Unknown',
      p.maxSlippageBps,
    ),
    check(
      'COST',
      'Execution costs',
      q?.gasUsd !== undefined && new Decimal(q.gasUsd).gte(0),
      'Unknown gas cost prevents an honest net-output comparison.',
      q?.gasUsd ?? 'Unknown',
    ),
    ...(p.side === 'sell'
      ? [
          check(
            'HOLDING',
            'Selected holding',
            p.sellTokenAddress?.toLowerCase() === r.tokenAddress.toLowerCase(),
            'Sell routes must use the actual selected token; representations are not interchangeable holdings.',
          ),
        ]
      : []),
    ...(p.executionMode === 'quote'
      ? []
      : [
          check(
            'SIMULATION',
            'Transaction simulation',
            e.simulation?.success === true,
            e.simulation?.error ??
              (r.demo
                ? 'Deterministic demo simulation; no chain call.'
                : 'The exact built transaction must simulate successfully.'),
          ),
        ]),
    ...(m.marketStatus === 'closed'
      ? [
          {
            code: 'MARKET_CLOSED',
            label: 'Traditional market closed',
            status: 'warn' as const,
            explanation:
              'Review the reference timestamp; on-chain liquidity may continue outside market hours.',
          },
        ]
      : []),
  ];
}
