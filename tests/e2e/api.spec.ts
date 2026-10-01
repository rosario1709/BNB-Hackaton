import { test, expect } from '@playwright/test';
test('HTTP receipts are session isolated and simulation receipts cannot execute', async ({ request, playwright }) => {
  const response = await request.post('/api/routes/evaluate', { data: { policy: { ticker: 'NVDA', amount: '10' } } });
  expect(response.status()).toBe(200);
  const receipt = await response.json();
  const other = await playwright.request.newContext({ baseURL: 'http://localhost:3100' });
  expect((await other.get(`/api/executions/${receipt.id}`)).status()).toBe(404);
  expect((await request.get(`/api/executions/${receipt.id}`)).status()).toBe(200);
  expect((await request.post('/api/execute', { data: { receiptId: receipt.id, wallet: '0x1111111111111111111111111111111111111111', confirmed: true } })).status()).toBe(403);
  expect((await request.post('/api/agent/best-execution', { data: { ticker: 'NVDA', amount: '10' } })).status()).toBe(401);
  await other.dispose();
});
test('HTTP boundary rejects cross-origin writes and oversized multibyte JSON', async ({ request }) => {
  expect((await request.post('/api/intent/parse', { headers: { Origin: 'https://untrusted.example' }, data: { text: 'Buy $10 of NVDA' } })).status()).toBe(403);
  expect((await request.post('/api/intent/parse', { data: { text: 'é'.repeat(7000) } })).status()).toBe(413);
});
test('judge distinguishes demo decisions from verified mainnet evidence', async ({ page }) => {
  await page.goto('/judge');
  await expect(page.getByRole('heading', { name: 'ATLAS', exact: true })).toBeVisible();
  await expect(page.getByText('NO VERIFIED MAINNET TRADE RECORDED YET', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Simulate routes', exact: true }).click();
  await expect(page.getByText('WHY THIS ROUTE WON')).toBeVisible();
  await expect(page.getByText('VERIFIED', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: `test-results/judge-${test.info().project.name}.png`, fullPage: true });
});
test('explicit judge demo refuses live execution mode', async ({ request }) => {
  const response = await request.post('/api/routes/evaluate', { data: { demo: true, policy: { ticker: 'NVDA', amount: '10' } } });
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ dataMode: 'demo', executed: false, decision: 'approved' });
  const live = await request.post('/api/routes/evaluate', { data: { demo: true, policy: { ticker: 'NVDA', amount: '10', executionMode: 'live' } } });
  expect(live.status()).toBe(400);
});
