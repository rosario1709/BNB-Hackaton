import { test, expect } from '@playwright/test';
test('all product pages render without horizontal overflow', async ({ page }) => {
  for (const url of [
    '/',
    '/trade',
    '/markets',
    '/portfolio',
    '/receipts',
    '/agent',
    '/system',
    '/judge',
  ]) {
    await page.goto(url);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.goto('/');
  await page.screenshot({
    path: `test-results/home-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test('successful race, blocked policy and immutable receipt', async ({ page }) => {
  await page.goto('/trade');
  await page.getByRole('button', { name: 'Simulate routes', exact: true }).click();
  await expect(page.getByText('POLICY PASSED', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ondo · NVDAon' })).toBeVisible();
  await expect(page.getByText('Funds moved: NO')).toBeVisible();
  await page.getByLabel('Demo scenario').selectOption('policy-block');
  await page.getByRole('button', { name: 'Simulate routes', exact: true }).click();
  await expect(page.getByText('TRADE BLOCKED', { exact: true })).toBeVisible();
  await page.goto('/receipts');
  await expect(page.getByRole('button').filter({ hasText: 'BUY NVDA' })).toHaveCount(2);
});
test('stale reference and simulation failure are explicit', async ({ page }) => {
  await page.goto('/trade');
  await page.getByLabel('Demo scenario').selectOption('stale-reference');
  await page.getByRole('button', { name: 'Simulate routes', exact: true }).click();
  await expect(page.getByText('TRADE BLOCKED', { exact: true })).toBeVisible();
  await page.locator('summary').first().click();
  await expect(page.getByText('Reference freshness', { exact: true }).first()).toBeVisible();
  await page.getByLabel('Demo scenario').selectOption('simulation-failure');
  await page.getByRole('button', { name: 'Simulate routes', exact: true }).click();
  await expect(page.getByText('TRADE BLOCKED', { exact: true })).toBeVisible();
});
test('invalid input and disconnected wallet are actionable', async ({ page }) => {
  await page.goto('/trade');
  await page.getByLabel('Trade intent').fill('Buy $-1 of INVALID');
  await page.getByRole('button', { name: 'Simulate routes', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByLabel('Trade intent').fill('Buy $10 of NO_SUCH_TICKER');
  await page.getByRole('button', { name: 'Simulate routes', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.goto('/portfolio');
  await expect(page.getByRole('heading', { name: 'Connect your wallet' })).toBeVisible();
});
test('quote-only policy rejection is distinct from simulation or execution refusal', async ({ page }) => {
  await page.goto('/trade');
  await page.getByLabel('Demo scenario').selectOption('stale-reference');
  await page.getByRole('button', { name: 'Simulate routes', exact: true }).click();
  await page.getByRole('combobox', { name: 'Mode', exact: true }).selectOption('quote');
  await page.getByRole('button', { name: 'Re-evaluate policy' }).click();
  await expect(page.getByRole('heading', { name: 'Route comparison', exact: true })).toBeVisible();
  await expect(page.getByText('QUOTES RECEIVED', { exact: true })).toBeVisible();
  await expect(page.getByText('POLICY NOT VERIFIED', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Quote policy needs review.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Simulation Race', exact: true })).toHaveCount(0);
  await expect(page.getByText('EXECUTION REFUSED', { exact: true })).toHaveCount(0);
  await expect(page.locator('.route-checks').filter({ hasText: 'SIM NOT RUN' })).toHaveCount(3);
});
