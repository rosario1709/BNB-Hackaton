import { afterEach, describe, expect, it, vi } from 'vitest';
import { independentReference } from '../packages/market/reference';

afterEach(() => vi.restoreAllMocks());

describe('Independent stock reference', () => {
  it('uses the Alpaca IEX trade timestamp and per-share price', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const transport = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          symbol: 'NVDA',
          trade: { p: 230.825, t: '2026-09-30T15:00:00.123456Z', x: 'V' },
        }),
      ),
    );
    const reference = await independentReference(
      'NVDA',
      { alpacaKeyId: 'test-id', alpacaSecretKey: 'test-secret' },
      transport,
    );
    expect(reference).toEqual({
      currency: 'USD', exchange: 'IEX (V)', independent: true,
      price: '230.825',
      timestamp: '2026-09-30T15:00:00.123Z',
      source: 'Alpaca IEX latest trade',
    });
    expect(String(transport.mock.calls[0][0])).toBe(
      'https://data.alpaca.markets/v2/stocks/NVDA/trades/latest?feed=iex',
    );
    expect(transport.mock.calls[0][1].headers).toMatchObject({
      'APCA-API-KEY-ID': 'test-id',
      'APCA-API-SECRET-KEY': 'test-secret',
    });
  });

  it('rejects mismatched symbols and exchanges outside the IEX feed', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const settings = { alpacaKeyId: 'test-id', alpacaSecretKey: 'test-secret' };
    const wrongSymbol = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ symbol: 'AAPL', trade: { p: 230, t: '2026-09-30T15:00:00Z', x: 'V' } }),
        ),
      );
    await expect(independentReference('NVDA', settings, wrongSymbol)).rejects.toThrow(
      'ticker mismatch',
    );
    const wrongExchange = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ symbol: 'NVDA', trade: { p: 230, t: '2026-09-30T15:00:00Z', x: 'Q' } }),
        ),
      );
    await expect(independentReference('NVDA', settings, wrongExchange)).rejects.toThrow();
  });

  it('keeps the configured independent service contract ahead of Alpaca', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const transport = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ticker: 'NVDA',
          currency: 'USD',
          price: '230.825',
          timestamp: '2026-09-30T15:00:00.000Z',
          source: 'Licensed feed',
          independent: true,
        }),
      ),
    );
    const reference = await independentReference(
      'NVDA',
      {
        url: 'https://reference.example/price',
        alpacaKeyId: 'test-id',
        alpacaSecretKey: 'test-secret',
      },
      transport,
    );
    expect(reference?.source).toBe('Licensed feed');
    expect(String(transport.mock.calls[0][0])).toBe('https://reference.example/price?ticker=NVDA');
  });
});
