import { afterEach, expect, it, vi } from 'vitest';
import { evaluate } from '../packages/agent/service';
import { LiveAdapter } from '../packages/market/live';
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it('uses only an explicitly requested fictional adapter when live credentials are configured', async () => {
  vi.stubEnv('ATLAS_DEMO_MODE', 'false'); vi.stubEnv('DATABASE_URL', '');
  vi.stubEnv('BINANCE_WEB3_API_KEY', 'synthetic-test-id'); vi.stubEnv('BINANCE_WEB3_API_SECRET', 'synthetic-test-secret');
  const external = vi.spyOn(LiveAdapter.prototype, 'discover').mockRejectedValue(new Error('Do not call live API'));
  const report = await evaluate({ demo: true, policy: { ticker: 'NVDA', amount: '10' } }, crypto.randomUUID());
  expect(report).toMatchObject({ dataMode: 'demo', executed: false, decision: 'approved' });
  expect(report.candidates.every((candidate) => candidate.representation.tokenAddress.startsWith('DEMO:'))).toBe(true);
  expect(external).not.toHaveBeenCalled();
});
it('rejects live mode before any evaluation of a requested fictional scenario', async () => {
  await expect(evaluate({ demo: true, policy: { ticker: 'NVDA', amount: '10', executionMode: 'live' } }, crypto.randomUUID())).rejects.toThrow('cannot use live');
});
