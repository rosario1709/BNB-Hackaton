import { afterEach, expect, it, vi } from 'vitest';
import { boundedJson, safeMessage } from '../packages/core/http';
import { productionReadiness } from '../packages/core/readiness';
afterEach(() => vi.unstubAllEnvs());
it('enforces the body limit in bytes even without a content-length header', async () => {
  const request = new Request('https://atlas.example/api', { method: 'POST', body: JSON.stringify({ value: 'é'.repeat(7000) }) });
  await expect(boundedJson(request)).rejects.toThrow('BODY_TOO_LARGE');
});
it('rejects invalid JSON and accepts a bounded JSON policy', async () => {
  await expect(boundedJson(new Request('https://atlas.example/api', { method: 'POST', body: 'bad' }))).rejects.toThrow('INVALID_JSON');
  expect(await boundedJson(new Request('https://atlas.example/api', { method: 'POST', body: '{"amount":"10"}' }))).toEqual({ amount: '10' });
});
it('redacts configured secrets from unexpected errors', () => {
  vi.stubEnv('ALPACA_API_SECRET_KEY', 'synthetic-secret-for-redaction');
  expect(safeMessage(new Error('failed synthetic-secret-for-redaction'))).toBe('failed [redacted]');
});
it('production readiness reports missing inputs without returning any values', () => {
  const report = productionReadiness({ ATLAS_USDT_ADDRESS: 'invalid', ATLAS_ALLOWED_ROUTERS: '', NEXT_PUBLIC_APP_URL: 'http://localhost:3000' });
  expect(report.status).toBe('NOT READY');
  expect(report.issues).toEqual(expect.arrayContaining(['MISSING_DATABASE_URL', 'MISSING_ALPACA_API_KEY_ID', 'EMPTY_ROUTER_ALLOWLIST', 'LIVE_TRADING_DISABLED', 'INVALID_ATLAS_USDT_ADDRESS', 'INVALID_NEXT_PUBLIC_APP_URL']));
});
it('allows a public demo configuration without live credentials while keeping live disabled', () => {
  const env = { DATABASE_URL: 'postgresql://operator@database.example/atlas', NEXT_PUBLIC_APP_URL: 'https://atlas.example',
    ATLAS_DEMO_MODE: 'true', ATLAS_LIVE_TRADING_ENABLED: 'false' };
  expect(productionReadiness(env, 'demo')).toMatchObject({ status: 'CONFIGURATION READY', profile: 'demo', issues: [] });
  expect(productionReadiness({ ...env, ATLAS_LIVE_TRADING_ENABLED: 'true' }, 'demo').issues).toContain('DEMO_LIVE_TRADING_MUST_BE_DISABLED');
  expect(productionReadiness(env).issues).toContain('MISSING_ALPACA_API_KEY_ID');
});
