import { policySchema, percentToBps, type Policy } from './domain';
/** Deliberately constrained grammar. Unknown clauses are rejected instead of silently discarded. */
export function parseIntent(text: string): Policy {
  if (text.length > 2000) throw new Error('Intent is too long');
  const normalized = text.trim();
  const head =
    /^(buy|sell)\s+(\$?)(\d+(?:\.\d+)?)\s*(USDT|tokens?)?\s+(?:of\s+)?([a-zA-Z][a-zA-Z0-9 .-]*?)(?=\s+using\b|[.!;\n]|$)/i.exec(
      normalized,
    );
  if (!head)
    throw new Error(
      'Use: Buy $10 of NVIDIA. Maximum slippage 0.5%. Maximum reference deviation 1%.',
    );
  const side = head[1].toLowerCase() as 'buy' | 'sell';
  if (side === 'sell' && (head[2] || head[4]?.toUpperCase() === 'USDT'))
    throw new Error(
      'Sell a token quantity, for example: Sell 0.05 tokens of NVDA. Select the holding before execution.',
    );
  let tail = normalized
    .slice(head[0].length)
    .replace(/^\s*using the best available (?:tokenized )?representation/i, '');
  let slippage = 50,
    deviation = 100;
  const slips = [...tail.matchAll(/(?:maximum|max)\s+slippage\s+(\d+(?:\.\d+)?)\s*%/gi)];
  const devs = [
    ...tail.matchAll(
      /(?:maximum|max)\s+(?:reference |price )?deviation\s+(\d+(?:\.\d+)?)\s*%|do not execute if (?:the )?(?:on-chain )?price (?:differs from the underlying reference by more than|deviation from the reference exceeds)\s+(\d+(?:\.\d+)?)\s*%/gi,
    ),
  ];
  if (slips.length > 1 || devs.length > 1) throw new Error('Specify each limit once');
  if (slips[0]) {
    slippage = percentToBps(slips[0][1]);
    tail = tail.replace(slips[0][0], '');
  }
  if (devs[0]) {
    deviation = percentToBps(devs[0][1] || devs[0][2]);
    tail = tail.replace(devs[0][0], '');
  }
  if (tail.replace(/[.!;\s]/g, ''))
    throw new Error(
      'A clause was not understood. Use the policy editor to set constraints explicitly.',
    );
  return policySchema.parse({
    ticker: head[5].trim(),
    side,
    amount: head[3],
    denomination: side === 'buy' ? 'USDT' : 'TOKEN',
    maxSlippageBps: slippage,
    maxReferenceDeviationBps: deviation,
  });
}
