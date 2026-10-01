import { afterEach, expect, it, vi } from 'vitest';
import { runWork } from '../packages/agent/studio-hook';
import { policySchema } from '../packages/core/domain';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it('Studio refuses live policy before invoking its report endpoint', async () => {
  const transport = vi.fn(); vi.stubGlobal('fetch', transport);
  await expect(runWork('{"ticker":"NVDA","amount":"10","executionMode":"live"}', { sessionId: 'test' })).rejects.toThrow('live execution prohibited');
  expect(transport).not.toHaveBeenCalled();
});
it('Studio returns a structured report without wallet signing capabilities', async () => {
  vi.stubEnv('ATLAS_REPORT_URL', 'https://atlas.example/api/agent/best-execution'); vi.stubEnv('ATLAS_AGENT_TOKEN', 'synthetic-bearer-for-tests-only-000000');
  const policy = policySchema.parse({ ticker: 'NVDA', amount: '10', executionMode: 'quote' });
  const report = { id: crypto.randomUUID(), intent: policy, candidates: [], decision: 'blocked', dataMode: 'live', executed: false };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(report))));
  expect(JSON.parse(await runWork(JSON.stringify(policy), { sessionId: 'test' }))).toEqual(report);
});
