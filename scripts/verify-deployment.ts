import { safeMessage } from '../packages/core/http';
import { z } from 'zod';

const checks: { name: string; passed: boolean; detail: string }[] = [];
try {
  const base = new URL(process.argv[2] ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000');
  if (base.username || base.password || base.search || base.hash ||
    (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))))
    throw new Error('Use an HTTPS application URL or an HTTP loopback URL without credentials.');
  const get = (path: string, headers?: Record<string, string>) => fetch(new URL(path, base), {
    headers, signal: AbortSignal.timeout(15000), redirect: 'error', cache: 'no-store',
  });
  const pages = ['/', '/trade', '/markets', '/portfolio', '/receipts', '/agent', '/system', '/judge'];
  const results = await Promise.allSettled(pages.map(async (path) => {
    const response = await get(path);
    const passed = response.ok && !!response.headers.get('content-type')?.includes('text/html') &&
      (await response.text()).includes('ATLAS') && response.headers.get('x-frame-options') === 'DENY';
    return { name: path, passed, detail: `HTTP ${response.status}; HTML and frame protection ${passed ? 'validated' : 'failed'}` };
  }));
  results.forEach((result, index) => checks.push(result.status === 'fulfilled' ? result.value :
    { name: pages[index], passed: false, detail: 'Request unavailable' }));
  const healthResponse = await get('/api/health');
  const health = z.object({ ok: z.literal(true), app: z.literal('ATLAS'), mode: z.enum(['demo', 'live']) }).parse(await healthResponse.json());
  checks.push({ name: 'health', passed: healthResponse.ok, detail: `${health.mode} data mode` });
  const statusResponse = await get('/api/system/status');
  const status = z.object({ liveEnabled: z.boolean(), persistence: z.string() }).parse(await statusResponse.json());
  checks.push({ name: 'database', passed: status.persistence === 'PostgreSQL connected', detail: status.persistence });
  if (health.mode === 'demo' || process.argv.includes('--demo')) {
    checks.push({ name: 'demo safety', passed: !status.liveEnabled, detail: status.liveEnabled ? 'Live trading flag must be disabled' : 'Live trading disabled' });
    const cookie = healthResponse.headers.get('set-cookie')?.split(';')[0];
    const response = await fetch(new URL('/api/routes/evaluate', base), {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base.origin, ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify({ demo: true, policy: { ticker: 'NVDA', amount: '10', executionMode: 'simulate' } }),
      signal: AbortSignal.timeout(30000), redirect: 'error',
    });
    const receipt = z.object({ id: z.uuid(), dataMode: z.literal('demo'), executed: z.literal(false), status: z.literal('simulated') }).parse(await response.json());
    const owner = await get(`/api/executions/${receipt.id}`, cookie ? { Cookie: cookie } : undefined);
    const other = await get(`/api/executions/${receipt.id}`);
    checks.push({ name: 'demo receipt persistence and ownership', passed: response.ok && owner.ok && other.status === 404,
      detail: 'Fictional evaluation stored; second browser session cannot read it. No wallet signature.' });
  }
} catch (error) {
  checks.push({ name: 'runtime verification', passed: false, detail: safeMessage(error) });
}
const passed = checks.length > 0 && checks.every((check) => check.passed);
console.log(JSON.stringify({ status: passed ? 'PASS' : 'NOT READY', checks, checkedAt: new Date().toISOString(),
  scope: 'HTTP runtime, security headers, database and demo receipt ownership. Does not verify live trading or external hosting ownership.', transactionsBroadcast: 0 }, null, 2));
process.exit(passed ? 0 : 1);
