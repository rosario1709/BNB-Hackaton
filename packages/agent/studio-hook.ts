import { policySchema } from '../core/domain';
import { z } from 'zod';
/** Install as the runWork hook in the official Studio-generated sellerCore.ts.
 * Studio verifies the funded ERC-8183 job and owns submission/signing. This hook cannot trade.
 */
export async function runWork(prompt: string, _opts: { sessionId: string }): Promise<string> {
  if (Buffer.byteLength(prompt) > 12000) throw new Error('Studio policy exceeds 12 KB.');
  const policy = policySchema.parse(JSON.parse(prompt));
  if (policy.executionMode === 'live')
    throw new Error('Intelligence-only agent: live execution prohibited.');
  const url = process.env.ATLAS_REPORT_URL,
    token = process.env.ATLAS_AGENT_TOKEN;
  if (!url || !token || token.length < 32)
    throw new Error('Configure ATLAS_REPORT_URL and ATLAS_AGENT_TOKEN in the Studio runtime.');
  const endpoint = new URL(url);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) throw new Error('Studio report endpoint must use HTTPS without URL credentials.');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(policy),
    signal: AbortSignal.timeout(60000),
    redirect: 'error',
  });
  if (!response.ok)
    throw new Error(
      `ATLAS report failed (${response.status}); do not submit a fabricated deliverable.`,
    );
  const report = z
    .object({
      id: z.uuid(),
      decision: z.enum(['approved', 'blocked']),
      dataMode: z.enum(['demo', 'live']),
      intent: policySchema,
      candidates: z.array(z.record(z.string(), z.unknown())),
      executed: z.literal(false),
    })
    .passthrough()
    .parse(await response.json());
  if (JSON.stringify(report.intent) !== JSON.stringify(policy))
    throw new Error('ATLAS report policy does not match the requested deliverable.');
  return JSON.stringify(report);
}
