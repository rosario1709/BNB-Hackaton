import { z } from 'zod';
import Decimal from 'decimal.js';
import { LiveAdapter } from './live';
import { ApiError } from '../binance-web3/client';
import {
  address,
  decimal,
  positive,
  type Market,
  type Representation,
  type Provider,
} from '../core/domain';
import { observe } from '../telemetry';
import { statusSchema } from '../binance-web3/schemas';
const base = '/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/rwa/';
export const publicTokensSchema = z
  .array(z.object({ chainId: z.string() }).passthrough())
  .transform((rows) => rows.filter((r) => r.chainId === '56'))
  .pipe(
    z.array(
      z.object({
        chainId: z.literal('56'),
        contractAddress: address,
        symbol: z.string(),
        ticker: z.string(),
        type: z.number().int(),
        multiplier: positive,
        assetType: z.number().optional(),
        d: z.number().int().min(0).max(36).optional(),
      }),
    ),
  );
const shared = globalThis as typeof globalThis & {
  atlasPublicTokens?: { expires: number; tokens: z.infer<typeof publicTokensSchema> };
};
async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  params: Record<string, string> = {},
): Promise<T> {
  const begin = performance.now();
  const startedAt = new Date().toISOString();
  let success = false,
    status: number | undefined;
  try {
    const url = new URL(path, 'https://www.binance.com');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const response = await fetch(url, {
      headers: { 'Accept-Encoding': 'identity', 'User-Agent': 'binance-web3/1.1 (Skill)' },
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
      cache: 'no-store',
    });
    status = response.status;
    if (!response.ok)
      throw new ApiError(
        'PUBLIC_API_UNAVAILABLE',
        `Public Binance discovery unavailable (HTTP ${status}).`,
      );
    const result = z
      .object({ code: z.string(), success: z.boolean(), data: z.unknown() })
      .parse(await response.json());
    if (result.code !== '000000' || !result.success)
      throw new ApiError('PUBLIC_API_ERROR', 'Public Binance discovery rejected the request.');
    const parsed = schema.parse(result.data);
    success = true;
    return parsed;
  } finally {
    observe({
      id: crypto.randomUUID(),
      correlationId: params.contractAddress ?? 'public-discovery',
      module: 'Wallet Skills',
      operation: path,
      startedAt,
      durationMs: Math.round(performance.now() - begin),
      httpStatus: status,
      success,
      attempt: 1,
      errorCode: success ? undefined : 'PUBLIC_DISCOVERY_FAILED',
    });
  }
}
/** Official unauthenticated Wallet Skill. No trading endpoints are substituted. */
export class PublicMarketAdapter extends LiveAdapter {
  async discover(query: string): Promise<Representation[]> {
    if (!shared.atlasPublicTokens || shared.atlasPublicTokens.expires < Date.now())
      shared.atlasPublicTokens = {
        tokens: await request(base + 'stock/detail/list/ai', publicTokensSchema),
        expires: Date.now() + 60000,
      };
    const tokens = shared.atlasPublicTokens.tokens.filter(
      (t) =>
        t.chainId === '56' &&
        [1, 2, 3].includes(t.type) &&
        t.assetType === 1 &&
        (!query ||
          t.ticker.toLowerCase() === query.toLowerCase() ||
          t.symbol.toLowerCase() === query.toLowerCase()),
    );
    const results: Representation[] = [];
    for (let i = 0; i < Math.min(tokens.length, 30); i += 3) {
      const batch = await Promise.allSettled(
        tokens.slice(i, i + 3).map(async (t) => {
          const params = { chainId: '56', contractAddress: t.contractAddress };
          const [meta, status] = await Promise.all([
            request(
              base + 'meta/ai',
              z.object({
                ticker: z.string(),
                companyInfo: z.object({ companyName: z.string() }).nullish(),
              }),
              params,
            ),
            request(
              base + 'asset/market/status/ai',
              statusSchema.extend({ marketStatus: statusSchema.shape.marketStatus.nullable() }),
              params,
            ),
          ]);
          if (meta.ticker !== t.ticker || t.d === undefined)
            throw new ApiError(
              'MISSING_METADATA',
              'Public token lacks verified decimals or matching ticker.',
            );
          return {
            ticker: t.ticker,
            companyName: meta.companyInfo?.companyName ?? t.ticker,
            provider: ({ 1: 'ondo', 2: 'xstocks', 3: 'bstocks' } as Record<number, Provider>)[
              t.type
            ],
            chain: 'bsc' as const,
            tokenAddress: t.contractAddress,
            symbol: t.symbol,
            decimals: t.d,
            sharesPerToken: t.multiplier,
            tradable: status.openState && (!status.reasonCode || status.reasonCode === 'TRADING'),
            status:
              status.marketStatus ??
              (status.openState && status.reasonCode === 'TRADING' ? 'active' : 'unknown'),
            sourceTimestamp: new Date().toISOString(),
            demo: false,
          };
        }),
      );
      for (const r of batch) if (r.status === 'fulfilled') results.push(r.value);
    }
    return results;
  }
  async market(r: Representation): Promise<Market> {
    const data = await request(
      '/bapi/defi/v2/public/wallet-direct/buw/wallet/market/token/rwa/dynamic/ai',
      z.object({
        ticker: z.string(),
        tokenInfo: z.object({ price: decimal, sharesMultiplier: positive }),
        stockInfo: z.object({ price: decimal.nullable() }),
      }),
      { chainId: '56', contractAddress: r.tokenAddress },
    );
    if (data.ticker !== r.ticker)
      throw new ApiError('TOKEN_MISMATCH', 'Public market ticker mismatch.');
    r.sharesPerToken = data.tokenInfo.sharesMultiplier;
    // stockInfo has no documented source timestamp. Never substitute request time for price time.
    return {
      tokenAddress: r.tokenAddress,
      onchainPrice: data.tokenInfo.price,
      derivedReferencePrice: new Decimal(data.tokenInfo.price)
        .div(data.tokenInfo.sharesMultiplier)
        .toFixed(),
      referencePrice: data.stockInfo.price ?? undefined,
      referenceSource: 'Binance Wallet Skill stock feed (source timestamp unavailable)',
      referenceIndependent: false,
      marketStatus: r.status,
      observedAt: new Date().toISOString(),
    };
  }
}
