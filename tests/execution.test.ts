import { describe, it, expect } from 'vitest';
import { evaluateRoutes } from '../packages/core/router';
import { DemoAdapter } from '../packages/market/demo';
import { policySchema } from '../packages/core/domain';
import { executionGate } from '../packages/execution';
import { getReceipt, saveReceipt, listReceipts } from '../packages/db';
async function report() {
  return evaluateRoutes(
    {
      ...policySchema.parse({ ticker: 'NVDA', amount: '10' }),
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    },
    new DemoAdapter(),
  );
}
describe('Execution boundary', () => {
  it('live is disabled by default', async () => {
    const r = await report();
    expect(() => executionGate(r, true, false, '10')).toThrow('disabled');
  });
  it('requires explicit confirmation', async () => {
    const r = await report();
    expect(() => executionGate(r, false, true, '10')).toThrow('confirmation');
  });
  it('demo simulation cannot broadcast', async () => {
    const r = await report();
    expect(() => executionGate(r, true, true, '10')).toThrow('cannot broadcast');
  });
  it('live-data simulation mode cannot broadcast', async () => {
    const r = await report();
    r.dataMode = 'live';
    expect(() => executionGate(r, true, true, '10')).toThrow('cannot broadcast');
  });
  it('rejected policy cannot broadcast', async () => {
    const r = await report();
    r.dataMode = 'live';
    r.intent.executionMode = 'live';
    r.decision = 'blocked';
    expect(() => executionGate(r, true, true, '10')).toThrow('Rejected');
  });
  it('failed simulation cannot broadcast', async () => {
    const r = await report();
    r.dataMode = 'live';
    r.intent.executionMode = 'live';
    r.candidates.find((c) => c.id === r.selectedRouteId)!.simulation!.success = false;
    expect(() => executionGate(r, true, true, '10')).toThrow('verified simulation');
  });
  it('receipts are immutable copies and isolated by owner', async () => {
    const r = await report();
    await saveReceipt('owner-a', r);
    r.reason = 'changed outside store';
    expect((await getReceipt('owner-a', r.id))?.reason).not.toBe(r.reason);
    expect(await getReceipt('owner-b', r.id)).toBeUndefined();
    expect(await listReceipts('owner-b')).toHaveLength(0);
  });
});
