import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { BinanceClient, signature } from '../packages/binance-web3/client';
import { quotesSchema, quoteBatchSchema, simulationSchema } from '../packages/binance-web3/schemas';
import fixture from './fixtures/official-shape/quote.json';
import { LiveAdapter, normalizeMarketStatus, simulationMatches } from '../packages/market/live';
import { DemoAdapter } from '../packages/market/demo';
import { policySchema } from '../packages/core/domain';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it('simulates and returns the identical EVM transaction without provider metadata', async () => {
  const wallet = '0x3333333333333333333333333333333333333333';
  const route = fixture.data[0];
  vi.stubEnv('ATLAS_USDT_ADDRESS', route.fromToken.tokenContractAddress);
  vi.stubEnv('ATLAS_USDT_DECIMALS', '18');
  const exact = { from: wallet, to: '0x4444444444444444444444444444444444444444', value: '0', data: '0x1234' };
  const transport = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(fixture)))
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: {
      executionMode: 'SWAP', routerResult: route,
      tx: { ...exact, minReceiveAmount: '55222500000000000', slippagePercent: '0.5', gas: '100000' },
    } })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: {
      status: 'SUCCESS', balanceChanges: [
        { owner: wallet, contractAddress: route.fromToken.tokenContractAddress, change: '-' + route.fromTokenAmount },
        { owner: wallet, contractAddress: route.toToken.tokenContractAddress, change: route.toTokenAmount },
      ], allowanceChanges: [],
    } })));
  const adapter = new LiveAdapter(new BinanceClient({ key: 'key', secret: 'secret' }, transport));
  const representation = (await new DemoAdapter().discover('NVDA'))[0];
  representation.tokenAddress = route.toToken.tokenContractAddress;
  const policy = policySchema.parse({ ticker: 'NVDA', amount: '10' });
  const quote = (await adapter.quotes(policy, representation, wallet))[0];
  const simulation = await adapter.simulate(policy, representation, quote, wallet);
  expect(simulation).toMatchObject({ success: true, transaction: exact });
  expect(Object.keys(simulation.transaction!).sort()).toEqual(['data', 'from', 'to', 'value']);
  expect(JSON.parse(transport.mock.calls[2][1].body).evmTx).toEqual(simulation.transaction);
});

it('rejects conflicting recipient echoes independently of a matching user wallet', async () => {
  const wallet = '0x3333333333333333333333333333333333333333';
  const route = fixture.data[0];
  vi.stubEnv('ATLAS_USDT_ADDRESS', route.fromToken.tokenContractAddress);
  vi.stubEnv('ATLAS_USDT_DECIMALS', '18');
  const adapter = new LiveAdapter(new BinanceClient({ key: 'key', secret: 'secret' }, vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ code: 0, data: [{ ...route, userWalletAddress: wallet, recipient: route.fromToken.tokenContractAddress }, route] })),
  )));
  const representation = (await new DemoAdapter().discover('NVDA'))[0];
  representation.tokenAddress = route.toToken.tokenContractAddress;
  expect(await adapter.quotes(policySchema.parse({ ticker: 'NVDA', amount: '10' }), representation, wallet)).toHaveLength(1);
  expect(adapter.quoteFailures(representation)[0].reason).toContain('recipient');
});
describe('Official adapters', () => {
  it('isolates malformed vendor schemas and retains a rejection reason', () => {
    const result = quoteBatchSchema.parse([{ vendorName: 'Broken vendor', toTokenAmount: 'nonsense' }, fixture.data[0]]);
    expect(result.routes).toHaveLength(1);
    expect(result.rejected[0]).toMatchObject({ vendor: 'Broken vendor', reason: expect.stringContaining('MALFORMED_QUOTE') });
  });
  it.each(['amount', 'token', 'decimals', 'recipient', 'zero-output'])('rejects quote %s inconsistency without losing a valid vendor', async (problem) => {
    const old = process.env.ATLAS_USDT_ADDRESS;
    process.env.ATLAS_USDT_ADDRESS = fixture.data[0].fromToken.tokenContractAddress;
    try {
      const bad = structuredClone(fixture.data[0]) as typeof fixture.data[0] & { recipient?: string };
      bad.quoteId = 'bad-vendor';
      if (problem === 'amount') bad.fromTokenAmount = '1';
      if (problem === 'token') bad.toToken.tokenContractAddress = bad.fromToken.tokenContractAddress;
      if (problem === 'decimals') bad.toToken.decimal = '6';
      if (problem === 'recipient') bad.recipient = fixture.data[0].fromToken.tokenContractAddress;
      if (problem === 'zero-output') bad.toTokenAmount = '0';
      const adapter = new LiveAdapter(new BinanceClient({ key: 'key', secret: 'secret' }, vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0, data: [bad, fixture.data[0]] })))));
      const representation = (await new DemoAdapter().discover('NVDA'))[0];
      representation.tokenAddress = fixture.data[0].toToken.tokenContractAddress;
      expect(await adapter.quotes(policySchema.parse({ ticker: 'NVDA', amount: '10' }), representation, '0x3333333333333333333333333333333333333333')).toHaveLength(1);
      expect(adapter.quoteFailures(representation)).toHaveLength(1);
    } finally { if (old === undefined) delete process.env.ATLAS_USDT_ADDRESS; else process.env.ATLAS_USDT_ADDRESS = old; }
  });
  it('treats an explicit TRADING state as active when marketStatus is null', () => {
    expect(
      normalizeMarketStatus({ marketStatus: null, openState: true, reasonCode: 'TRADING' }),
    ).toBe('active');
    expect(normalizeMarketStatus({ marketStatus: null, openState: true, reasonCode: null })).toBe(
      'unknown',
    );
  });
  it('signs encoded path with build prefix', () => {
    const actual = signature(
      'secret',
      '2026-09-29T00:00:00.000Z',
      'GET',
      '/build/api/v1/dex/market/rwa/search?keyword=A%20B',
    );
    expect(actual).toBe(
      createHmac('sha256', 'secret')
        .update('2026-09-29T00:00:00.000ZGET/build/api/v1/dex/market/rwa/search?keyword=A%20B')
        .digest('base64'),
    );
  });
  it('validates the documented quote shape', () =>
    expect(quotesSchema.parse(fixture.data)[0].fromToken.decimal).toBe(18));
  it('checks business errors even on HTTP 200', async () => {
    const client = new BinanceClient(
      { key: 'key', secret: 'secret' },
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 40374, data: null }))),
    );
    await expect(
      client.call('Trading', '/api/v1/dex/aggregator/quote', quotesSchema),
    ).rejects.toMatchObject({ code: '40374' });
  });
  it('rejects malformed upstream data', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sensitiveValue = 'private-wallet-balance-marker';
    const client = new BinanceClient(
      { key: 'key', secret: 'secret' },
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ code: 0, data: [{ fake: sensitiveValue }] })),
        ),
    );
    await expect(
      client.call('Trading', '/api/v1/dex/aggregator/quote', quotesSchema),
    ).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });
    expect(JSON.stringify(log.mock.calls)).not.toContain(sensitiveValue);
  });
  it('missing credentials never calls network', async () => {
    const fetch = vi.fn();
    const client = new BinanceClient({ key: undefined, secret: undefined }, fetch);
    await expect(
      client.call('RWA', '/api/v1/dex/market/rwa/tokens', quotesSchema),
    ).rejects.toMatchObject({ code: 'MISSING_CREDENTIALS' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('passes the exact signed encoded URL to transport', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture)));
    const client = new BinanceClient({ key: 'key', secret: 'secret' }, fetch);
    await client.call('Trading', '/api/v1/dex/aggregator/quote', quotesSchema, { keyword: 'A B' });
    expect(fetch.mock.calls[0][0]).toBe(
      'https://web3.binance.com/build/api/v1/dex/aggregator/quote?keyword=A%20B',
    );
  });
  it('keeps a valid vendor quote when another vendor returns an unsafe route', async () => {
    const previousUsdt = process.env.ATLAS_USDT_ADDRESS;
    process.env.ATLAS_USDT_ADDRESS = fixture.data[0].fromToken.tokenContractAddress;
    try {
      const valid = fixture.data[0];
      const unsafe = {
        ...valid,
        quoteId: 'unsafe-route',
        toToken: { ...valid.toToken, isHoneyPot: true },
      };
      const client = new BinanceClient(
        { key: 'key', secret: 'secret' },
        vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0, data: [unsafe, valid] }))),
      );
      const representation = (await new DemoAdapter().discover('NVDA'))[0];
      representation.tokenAddress = valid.toToken.tokenContractAddress;
      const quotes = await new LiveAdapter(client).quotes(
        policySchema.parse({ ticker: 'NVDA', amount: '10' }),
        representation,
        '0x3333333333333333333333333333333333333333',
      );
      expect(quotes.map((quote) => quote.id)).toEqual(['fixture-quote']);
    } finally {
      if (previousUsdt === undefined) delete process.env.ATLAS_USDT_ADDRESS;
      else process.env.ATLAS_USDT_ADDRESS = previousUsdt;
    }
  });
  it('checks simulated output and forbids unrelated drains or allowance changes', async () => {
    const demo = new DemoAdapter(),
      r = (await demo.discover('NVDA'))[0],
      q = (await demo.quotes(policySchema.parse({ ticker: 'NVDA', amount: '10' }), r))[0];
    const wallet = '0x3333333333333333333333333333333333333333';
    q.inputToken = fixture.data[0].fromToken.tokenContractAddress;
    q.outputToken = fixture.data[0].toToken.tokenContractAddress;
    const raw = simulationSchema.parse({
      status: 'SUCCESS',
      balanceChanges: [
        { owner: wallet, contractAddress: q.inputToken, change: '-' + q.amountInRaw },
        { owner: wallet, contractAddress: q.outputToken, change: q.amountOutRaw },
      ],
      allowanceChanges: [],
    });
    expect(simulationMatches(raw, q, wallet)).toBe(true);
    raw.balanceChanges[1].change = '1';
    expect(simulationMatches(raw, q, wallet)).toBe(false);
    raw.balanceChanges[1].change = q.amountOutRaw;
    raw.balanceChanges.push({
      owner: wallet,
      contractAddress: '0x4444444444444444444444444444444444444444',
      change: '-1',
    });
    expect(simulationMatches(raw, q, wallet)).toBe(false);
  });
});
