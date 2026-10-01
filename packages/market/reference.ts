import Decimal from 'decimal.js';
import { z } from 'zod';
import { positive } from '../core/domain';
import { observe } from '../telemetry';

type ReferenceSettings = {
  url?: string;
  token?: string;
  alpacaKeyId?: string;
  alpacaSecretKey?: string;
};
export function referenceConfiguration() {
  const missing = process.env.ATLAS_REFERENCE_URL ? [] :
    ['ALPACA_API_KEY_ID', 'ALPACA_API_SECRET_KEY'].filter((key) => !process.env[key]);
  return { configured: missing.length === 0, missing, message: missing.length
    ? `Independent stock reference is unavailable. Configure ${missing.join(' and ')} in .env.local.` : undefined };
}

const serviceSchema = z.object({
  ticker: z.string(),
  currency: z.literal('USD'),
  price: positive,
  timestamp: z.iso.datetime(),
  source: z.string().min(1),
  independent: z.literal(true),
  exchange: z.string().min(1).optional(),
});

const alpacaSchema = z.object({
  symbol: z.string(),
  trade: z.object({
    p: z.number().positive(),
    t: z.string(),
    x: z.literal('V'),
  }),
});

export async function independentReference(
  ticker: string,
  settings: ReferenceSettings = {
    url: process.env.ATLAS_REFERENCE_URL,
    token: process.env.ATLAS_REFERENCE_TOKEN,
    alpacaKeyId: process.env.ALPACA_API_KEY_ID,
    alpacaSecretKey: process.env.ALPACA_API_SECRET_KEY,
  },
  transport: typeof fetch = fetch,
): Promise<{ price: string; timestamp: string; source: string; currency: 'USD'; exchange: string; independent: true } | undefined> {
  const provider = settings.url
    ? 'service'
    : settings.alpacaKeyId || settings.alpacaSecretKey
      ? 'alpaca'
      : undefined;
  if (!provider) return undefined;

  const began = performance.now();
  const startedAt = new Date().toISOString();
  let success = false;
  let httpStatus: number | undefined;
  try {
    if (provider === 'service' && settings.url) {
      const url = new URL(settings.url);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Reference service must use HTTPS without credentials in its URL');
      url.searchParams.set('ticker', ticker);
      const response = await transport(url, {
        headers: settings.token ? { Authorization: `Bearer ${settings.token}` } : {},
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
        cache: 'no-store',
      });
      httpStatus = response.status;
      if (!response.ok) throw new Error('Reference service unavailable');
      const reference = serviceSchema.parse(await response.json());
      if (reference.ticker !== ticker) throw new Error('Reference ticker mismatch');
      success = true;
      return {
        price: reference.price,
        timestamp: reference.timestamp,
        source: reference.source,
        currency: 'USD', exchange: reference.exchange ?? 'Operator reference service', independent: true,
      };
    }

    if (!settings.alpacaKeyId || !settings.alpacaSecretKey)
      throw new Error(`Independent stock reference is unavailable. Configure ${[
        !settings.alpacaKeyId && 'ALPACA_API_KEY_ID', !settings.alpacaSecretKey && 'ALPACA_API_SECRET_KEY',
      ].filter(Boolean).join(' and ')} in .env.local.`);
    if (!/^[A-Z0-9.]{1,15}$/.test(ticker))
      throw new Error('Ticker is not supported by the Alpaca reference adapter.');
    const url = new URL(`https://data.alpaca.markets/v2/stocks/${ticker}/trades/latest`);
    url.searchParams.set('feed', 'iex');
    const response = await transport(url, {
      headers: {
        'APCA-API-KEY-ID': settings.alpacaKeyId,
        'APCA-API-SECRET-KEY': settings.alpacaSecretKey,
      },
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
      cache: 'no-store',
    });
    httpStatus = response.status;
    if (!response.ok)
      throw new Error(`Alpaca IEX reference unavailable (HTTP ${response.status}).`);
    const latest = alpacaSchema.parse(await response.json());
    if (latest.symbol !== ticker) throw new Error('Alpaca reference ticker mismatch');
    const timestamp = new Date(latest.trade.t).toISOString();
    success = true;
    return {
      price: new Decimal(latest.trade.p).toFixed(),
      timestamp,
      source: 'Alpaca IEX latest trade',
      currency: 'USD', exchange: 'IEX (V)', independent: true,
    };
  } finally {
    observe({
      id: crypto.randomUUID(),
      correlationId: ticker,
      module: 'Reference',
      operation: provider === 'alpaca' ? 'alpaca-iex-latest-trade' : 'independent-reference',
      startedAt,
      durationMs: Math.round(performance.now() - began),
      httpStatus,
      success,
      attempt: 1,
      errorCode: success ? undefined : 'REFERENCE_UNAVAILABLE',
    });
  }
}
