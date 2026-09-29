import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { beforeAll, afterAll, it, expect } from 'vitest';
const token = randomBytes(24).toString('hex');
const port = 18081;
let child: ChildProcess;
beforeAll(async () => {
  child = spawn(process.execPath, ['--import', 'tsx', 'packages/agent/server.ts'], {
    env: {
      ...process.env,
      ATLAS_AGENT_TOKEN: token,
      ATLAS_AGENT_PORT: String(port),
      ATLAS_DEMO_MODE: 'true',
      DATABASE_URL: '',
    },
    stdio: 'ignore',
    windowsHide: true,
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return;
    } catch {
      /* Wait for process startup */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Agent did not start');
}, 10000);
afterAll(() => {
  child?.kill();
});
it('standalone agent refuses unauthenticated requests', async () => {
  expect(
    (await fetch(`http://127.0.0.1:${port}/best-execution`, { method: 'POST', body: '{}' })).status,
  ).toBe(401);
});
it('standalone agent returns a deterministic report', async () => {
  const res = await fetch(`http://127.0.0.1:${port}/best-execution`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ policy: { ticker: 'NVDA', amount: '10' } }),
  });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({
    decision: 'approved',
    executed: false,
    dataMode: 'demo',
  });
});
it('standalone agent refuses live execution', async () => {
  const res = await fetch(`http://127.0.0.1:${port}/best-execution`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ policy: { ticker: 'NVDA', amount: '10', executionMode: 'live' } }),
  });
  expect(res.status).toBe(400);
});
