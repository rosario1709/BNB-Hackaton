import { test, expect } from '@playwright/test';
import { encodeFunctionData, erc20Abi, type Address } from 'viem';
import { policySchema } from '../../packages/core/domain';
import { evaluateRoutes } from '../../packages/core/router';
import { DemoAdapter } from '../../packages/market/demo';

test('token approval requires a separate explicit wallet confirmation', async ({ page }) => {
  const wallet = '0x2222222222222222222222222222222222222222';
  const token = '0x1111111111111111111111111111111111111111';
  const spender = '0x3333333333333333333333333333333333333333';
  const hash = `0x${'a'.repeat(64)}`;
  const approvalId = crypto.randomUUID();
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [spender as Address, 10n * 10n ** 18n],
  });
  const receipt = await evaluateRoutes(
    {
      ...policySchema.parse({ ticker: 'NVDA', amount: '10', executionMode: 'live' }),
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    },
    new DemoAdapter('simulation-failure'),
  );
  receipt.dataMode = 'live';
  for (const candidate of receipt.candidates)
    if (candidate.quote) candidate.quote.approveTarget = spender;

  await page.addInitScript(
    ({ wallet, hash }) => {
      const probe = window as unknown as Window & { atlasSent: unknown[]; ethereum: unknown };
      probe.atlasSent = [];
      probe.ethereum = {
        request: async ({ method, params }: { method: string; params?: unknown[] }) => {
          if (method === 'eth_chainId') return '0x38';
          if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [wallet];
          if (method === 'eth_sendTransaction') {
            probe.atlasSent.push(params?.[0]);
            return hash;
          }
          throw new Error(`Unexpected wallet request: ${method}`);
        },
      };
      sessionStorage.setItem('atlas_wallet', wallet);
    },
    { wallet, hash },
  );
  await page.route('**/api/system/status', (route) =>
    route.fulfill({
      json: {
        mode: 'live',
        liveEnabled: true,
        credentials: true,
        persistence: 'PostgreSQL connected',
        readiness: {
          apiCredentials: true,
          database: true,
          independentReference: true,
          usdt: true,
          routers: true,
        },
        maxTrade: '10',
        integrations: [],
        telemetry: [],
        observations: [],
      },
    }),
  );
  const evaluations: unknown[] = [];
  await page.route('**/api/routes/evaluate', (route) => { evaluations.push(route.request().postDataJSON()); return route.fulfill({ json: { ...receipt, id: crypto.randomUUID() } }); });
  await page.route('**/api/approval/verify', (route) => route.fulfill({ json: {
    approval: { id: approvalId, status: 'confirmed', wallet, token, spender, amountRaw: (10n * 10n ** 18n).toString(), allowanceRaw: (10n * 10n ** 18n).toString(), transactionHash: hash },
    policy: { ...receipt.intent, executionMode: 'live' },
  } }));
  await page.route('**/api/approval/prepare', (route) =>
    route.fulfill({
      json: {
        status: 'required',
        approvalId,
        transaction: { from: wallet, to: token, value: '0', data },
        token,
        spender,
        amount: '10000000000000000000',
        displayAmount: '10',
        denomination: 'USDT',
        routeSymbol: 'NVDAon',
      },
    }),
  );

  await page.goto('/trade');
  await page.getByRole('button', { name: 'Simulate routes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Check exact approval' })).toBeVisible();
  await page.getByRole('button', { name: 'Check exact approval' }).click();
  const submit = page.getByRole('button', { name: 'Confirm approval in wallet' });
  await expect(submit).toBeDisabled();
  expect(
    await page.evaluate(() => (window as unknown as Window & { atlasSent: unknown[] }).atlasSent),
  ).toEqual([]);
  await page.getByLabel('I understand this transaction only grants an allowance. I authorize this exact amount and the BNB gas fee.').check();
  await submit.click();
  expect(
    await page.evaluate(() => (window as unknown as Window & { atlasSent: unknown[] }).atlasSent),
  ).toEqual([{ from: wallet, to: token, value: '0x0', data, chainId: '0x38' }]);
  await expect(page.getByRole('button', { name: 'Check approval confirmation' })).toBeVisible();
  await page.getByRole('button', { name: 'Check approval confirmation' }).click();
  await expect.poll(() => evaluations.length).toBe(2);
  expect(evaluations[1]).toMatchObject({ approvalId, policy: { executionMode: 'live' } });
  // Re-evaluation sends only policy/wallet/approval provenance, never an old quote or simulation.
  expect(evaluations[1]).not.toHaveProperty('quote');
  expect(evaluations[1]).not.toHaveProperty('simulation');
  expect(await page.evaluate(() => (window as unknown as Window & { atlasSent: unknown[] }).atlasSent)).toHaveLength(1);
});
