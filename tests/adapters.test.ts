import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { BinanceClient, signature } from '../packages/binance-web3/client';
import { quotesSchema, simulationSchema } from '../packages/binance-web3/schemas';
import fixture from './fixtures/official-shape/quote.json';
import { simulationMatches } from '../packages/market/live';
import { DemoAdapter } from '../packages/market/demo';
import { policySchema } from '../packages/core/domain';
afterEach(() => vi.restoreAllMocks());
describe('Official adapters', () => {
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
    const client = new BinanceClient(
      { key: 'key', secret: 'secret' },
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0, data: [{ fake: true }] }))),
    );
    await expect(
      client.call('Trading', '/api/v1/dex/aggregator/quote', quotesSchema),
    ).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });
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
