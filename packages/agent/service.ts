import { z } from 'zod';
import { policySchema, scenarioSchema, address, type Receipt } from '../core/domain';
import { config } from '../core/config';
import { DemoAdapter } from '../market/demo';
import { LiveAdapter } from '../market/live';
import { PublicMarketAdapter } from '../market/public';
import { BinanceClient } from '../binance-web3/client';
import { evaluateRoutes } from '../core/router';
import { saveReceipt } from '../db';
export const evaluationRequest = z.object({
  policy: policySchema,
  wallet: address.optional(),
  scenario: scenarioSchema.default('successful-best-execution'),
  userText: z.string().max(2000).optional(),
});
export function adapter(
  scenario: z.infer<typeof scenarioSchema> = 'successful-best-execution',
  correlationId?: string,
) {
  const cfg = config();
  return cfg.demo
    ? new DemoAdapter(scenario)
    : cfg.credentials
      ? new LiveAdapter(new BinanceClient(undefined, undefined, correlationId))
      : new PublicMarketAdapter();
}
export async function evaluate(input: unknown, owner: string): Promise<Receipt> {
  const req = evaluationRequest.parse(input);
  const id = crypto.randomUUID();
  const report = await evaluateRoutes(
    { ...req.policy, id, createdAt: new Date().toISOString(), userText: req.userText },
    adapter(req.scenario, id),
    req.wallet,
  );
  await saveReceipt(owner, report);
  return report;
}
