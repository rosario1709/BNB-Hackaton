import { z } from 'zod';
import { policySchema, scenarioSchema, address, type Receipt, type TradeIntent } from '../core/domain';
import { config } from '../core/config';
import { DemoAdapter } from '../market/demo';
import { LiveAdapter } from '../market/live';
import { PublicMarketAdapter } from '../market/public';
import { BinanceClient } from '../binance-web3/client';
import { evaluateRoutes } from '../core/router';
import { saveReceipt, getApproval } from '../db';
export const evaluationRequest = z.object({
  policy: policySchema,
  wallet: address.optional(),
  scenario: scenarioSchema.default('successful-best-execution'),
  userText: z.string().max(2000).optional(),
  approvalId: z.uuid().optional(),
});
export const agentReportRequest = z.union([
  z.object({ policy: policySchema, wallet: address.optional() }),
  policySchema.transform((policy) => ({ policy })),
]);
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
export async function evaluate(input: unknown, owner: string, existingIntent?: TradeIntent): Promise<Receipt> {
  const req = evaluationRequest.parse(input);
  const id = existingIntent?.id ?? crypto.randomUUID();
  const report = await evaluateRoutes(
    { ...req.policy, id, createdAt: existingIntent?.createdAt ?? new Date().toISOString(), userText: req.userText ?? existingIntent?.userText },
    adapter(req.scenario, id),
    req.wallet,
  );
  if (req.approvalId) {
    const approval = await getApproval(owner, req.approvalId);
    if (!approval || approval.evidence.status !== 'confirmed' || approval.evidence.wallet.toLowerCase() !== req.wallet?.toLowerCase() ||
      approval.policy.side !== req.policy.side || approval.policy.amount !== req.policy.amount || approval.policy.ticker.toUpperCase() !== req.policy.ticker.toUpperCase())
      throw new Error('Confirmed approval not found for this wallet and browser session.');
    report.approval = approval.evidence;
  }
  await saveReceipt(owner, report);
  return report;
}
