import { z } from 'zod';
import Decimal from 'decimal.js';
import { BinanceClient, ApiError } from '../binance-web3/client';
import {
  tokensSchema,
  searchSchema,
  pricesSchema,
  underlyingSchema,
  quotesSchema,
  swapSchema,
  simulationSchema,
} from '../binance-web3/schemas';
import {
  address,
  positive,
  fromRaw,
  toRaw,
  type DataAdapter,
  type Market,
  type Policy,
  type Provider,
  type Quote,
  type Representation,
  type Simulation,
} from '../core/domain';
import { observe } from '../telemetry';
export function simulationMatches(
  raw: z.infer<typeof simulationSchema>,
  q: Quote,
  wallet: string,
): boolean {
  const changes = raw.balanceChanges.filter((c) => c.owner.toLowerCase() === wallet.toLowerCase());
  const delta = (token: string) =>
    changes
      .filter((c) => c.contractAddress.toLowerCase() === token.toLowerCase())
      .reduce((s, c) => s + BigInt(c.change), 0n);
  const minimum = (BigInt(q.amountOutRaw) * BigInt(10000 - q.slippageBps)) / 10000n;
  return (
    raw.status === 'SUCCESS' &&
    delta(q.inputToken) === -BigInt(q.amountInRaw) &&
    delta(q.outputToken) >= minimum &&
    raw.allowanceChanges.length === 0 &&
    changes.every(
      (c) =>
        [
          q.inputToken.toLowerCase(),
          q.outputToken.toLowerCase(),
          '',
          '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          '0x0000000000000000000000000000000000000000',
        ].includes(c.contractAddress.toLowerCase()) || BigInt(c.change) >= 0n,
    )
  );
}
export class LiveAdapter implements DataAdapter {
  readonly mode = 'live' as const;
  constructor(public client = new BinanceClient()) {}
  async discover(query: string): Promise<Representation[]> {
    const [tokens, matches] = await Promise.all([
      this.client.call('RWA', '/api/v1/dex/market/rwa/tokens', tokensSchema, {
        binanceChainId: '56',
      }),
      query
        ? this.client.call('RWA', '/api/v1/dex/market/rwa/search', searchSchema, { keyword: query })
        : Promise.resolve(undefined),
    ]);
    const exact = matches?.filter((m) => m.ticker.toUpperCase() === query.toUpperCase());
    const selected = exact?.length ? exact : matches;
    const allowed = selected
      ? new Set(
          selected.flatMap((m) =>
            m.assets
              .filter((a) => a.binanceChainId === '56')
              .map((a) => a.tokenContractAddress.toLowerCase()),
          ),
        )
      : undefined;
    return tokens
      .filter(
        (t) =>
          t.binanceChainId === '56' &&
          t.assetType === 1 &&
          (!allowed || allowed.has(t.tokenContractAddress.toLowerCase())),
      )
      .map((t) => ({
        ticker: t.underlyingTicker,
        companyName: t.underlyingName,
        provider:
          (
            { ondo: 'ondo', bstock: 'bstocks', xstock: 'xstocks', xstocks: 'xstocks' } as Record<
              string,
              Provider
            >
          )[t.platformId] ?? 'unknown',
        chain: 'bsc',
        tokenAddress: t.tokenContractAddress,
        symbol: t.tokenSymbol,
        decimals: t.decimals,
        sharesPerToken: t.tokenToShareRatio,
        tradable:
          t.statusInfo.openState &&
          (!t.statusInfo.reasonCode || t.statusInfo.reasonCode === 'TRADING'),
        status: t.statusInfo.marketStatus,
        sourceTimestamp: new Date().toISOString(),
        demo: false,
      }));
  }
  async market(r: Representation): Promise<Market> {
    const [prices, underlying] = await Promise.all([
      this.client.call('Market', '/api/v1/dex/market/rwa/price', pricesSchema, {
        binanceChainId: '56',
        tokenContractAddresses: r.tokenAddress,
      }),
      this.client.call('RWA', '/api/v1/dex/market/rwa/underlying-market', underlyingSchema, {
        binanceChainId: '56',
        tokenContractAddress: r.tokenAddress,
      }),
    ]);
    const price = prices.find(
      (p) =>
        p.binanceChainId === '56' &&
        p.tokenContractAddress.toLowerCase() === r.tokenAddress.toLowerCase(),
    );
    if (
      underlying.binanceChainId !== '56' ||
      underlying.tokenContractAddress.toLowerCase() !== r.tokenAddress.toLowerCase()
    )
      throw new ApiError('TOKEN_MISMATCH', 'RWA response does not match the requested token.');
    r.tradable =
      underlying.statusInfo.openState &&
      (!underlying.statusInfo.reasonCode || underlying.statusInfo.reasonCode === 'TRADING');
    r.status = underlying.statusInfo.marketStatus;
    const market: Market = {
      tokenAddress: r.tokenAddress,
      onchainPrice: price?.tokenPrice,
      onchainTimestamp: price ? new Date(price.tokenPriceUpdatedAt).toISOString() : undefined,
      derivedReferencePrice: price?.referencePrice,
      marketStatus: underlying.statusInfo.marketStatus,
      nextMarketOpen: underlying.statusInfo.nextOpenTime
        ? new Date(underlying.statusInfo.nextOpenTime).toISOString()
        : undefined,
      observedAt: new Date().toISOString(),
    };
    if (process.env.ATLAS_REFERENCE_URL) {
      const began = performance.now();
      let success = false;
      try {
        const url = new URL(process.env.ATLAS_REFERENCE_URL);
        if (url.protocol !== 'https:') throw new Error('Reference service must use HTTPS');
        url.searchParams.set('ticker', r.ticker);
        const response = await fetch(url, {
          headers: process.env.ATLAS_REFERENCE_TOKEN
            ? { Authorization: `Bearer ${process.env.ATLAS_REFERENCE_TOKEN}` }
            : {},
          signal: AbortSignal.timeout(8000),
          redirect: 'error',
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Reference service unavailable');
        const ref = z
          .object({
            ticker: z.string(),
            currency: z.literal('USD'),
            price: positive,
            timestamp: z.iso.datetime(),
            source: z.string().min(1),
            independent: z.literal(true),
          })
          .parse(await response.json());
        if (ref.ticker !== r.ticker) throw new Error('Reference ticker mismatch');
        market.referencePrice = ref.price;
        market.referenceTimestamp = ref.timestamp;
        market.referenceSource = ref.source;
        success = true;
      } finally {
        observe({
          id: crypto.randomUUID(),
          correlationId: r.ticker,
          module: 'Reference',
          operation: 'independent-reference',
          startedAt: market.observedAt,
          durationMs: Math.round(performance.now() - began),
          success,
          attempt: 1,
          errorCode: success ? undefined : 'REFERENCE_UNAVAILABLE',
        });
      }
    }
    return market;
  }
  async quotes(p: Policy, r: Representation, wallet?: string): Promise<Quote[]> {
    const usdt = address.safeParse(process.env.ATLAS_USDT_ADDRESS);
    if (!usdt.success)
      throw new ApiError(
        'USDT_NOT_CONFIGURED',
        'Set a verified BSC USDT contract in ATLAS_USDT_ADDRESS.',
      );
    const usdtDecimals = z.coerce
      .number()
      .int()
      .min(0)
      .max(36)
      .parse(process.env.ATLAS_USDT_DECIMALS ?? 18);
    const input = p.side === 'buy' ? usdt.data : r.tokenAddress,
      output = p.side === 'buy' ? r.tokenAddress : usdt.data;
    const raw = toRaw(p.amount, p.side === 'buy' ? usdtDecimals : r.decimals);
    if (!wallet)
      throw new ApiError(
        'WALLET_DISCONNECTED',
        'Connect a wallet to obtain receiver-bound tokenized-equity quotes.',
      );
    const began = Date.now();
    const routes = await this.client.call('Trading', '/api/v1/dex/aggregator/quote', quotesSchema, {
      binanceChainId: '56',
      amount: raw,
      fromTokenAddress: input,
      toTokenAddress: output,
      userWalletAddress: address.parse(wallet),
    });
    return routes.map((q) => {
      if (
        q.fromToken.tokenContractAddress.toLowerCase() !== input.toLowerCase() ||
        q.toToken.tokenContractAddress.toLowerCase() !== output.toLowerCase() ||
        q.fromTokenAmount !== raw ||
        q.fromToken.decimal !== (p.side === 'buy' ? usdtDecimals : r.decimals) ||
        q.toToken.decimal !== (p.side === 'buy' ? r.decimals : usdtDecimals)
      )
        throw new ApiError(
          'QUOTE_MISMATCH',
          'Quote token, amount, or decimals do not match the request.',
        );
      if (
        q.fromToken.isHoneyPot ||
        q.toToken.isHoneyPot ||
        new Decimal(q.fromToken.taxRate).gt(0) ||
        new Decimal(q.toToken.taxRate).gt(0)
      )
        throw new ApiError('UNSAFE_TOKEN', 'Honeypot or taxed tokens are unsupported.');
      return {
        id: q.quoteId,
        vendor: q.vendorName,
        executionMode: q.executionMode,
        inputToken: input,
        outputToken: output,
        amountIn: p.amount,
        amountInRaw: raw,
        expectedAmountOut: fromRaw(q.toTokenAmount, q.toToken.decimal),
        amountOutRaw: q.toTokenAmount,
        outputDecimals: q.toToken.decimal,
        inputPriceUsd: q.fromToken.tokenUnitPrice,
        outputPriceUsd: q.toToken.tokenUnitPrice,
        gasUsd: q.tradeFee ?? undefined,
        slippageBps: p.maxSlippageBps,
        priceImpactBps:
          q.priceImpactPercent == null
            ? undefined
            : new Decimal(q.priceImpactPercent).abs().mul(100).ceil().toNumber(),
        quotedAt: new Date(began).toISOString(),
        expiresAt: new Date(began + 25000).toISOString(),
        raw: q,
      };
    });
  }
  async simulate(p: Policy, r: Representation, q: Quote, wallet?: string): Promise<Simulation> {
    if (!wallet)
      return { success: false, kind: 'unavailable', error: 'Connect a wallet before simulation.' };
    if (q.executionMode === 'RFQ')
      return {
        success: false,
        kind: 'unavailable',
        error:
          'RFQ settlement cannot be simulated through the documented EVM transaction endpoint. ATLAS blocks signing until a verifiable settlement simulation is available.',
      };
    const swap = await this.client.call('Trading', '/api/v1/dex/aggregator/swap', swapSchema, {
      binanceChainId: '56',
      amount: q.amountInRaw,
      fromTokenAddress: q.inputToken,
      toTokenAddress: q.outputToken,
      userWalletAddress: wallet,
      quoteId: q.id,
      slippagePercent: new Decimal(p.maxSlippageBps).div(100).toFixed(),
      autoSlippage: 'false',
      priceImpactProtectionPercent: new Decimal(p.maxSlippageBps).div(100).toFixed(),
    });
    const tx = swap.tx,
      rr = swap.routerResult;
    if (
      !tx ||
      swap.executionMode !== 'SWAP' ||
      tx.from.toLowerCase() !== wallet.toLowerCase() ||
      tx.value !== '0' ||
      rr.fromTokenAmount !== q.amountInRaw ||
      rr.toTokenAmount !== q.amountOutRaw ||
      rr.fromToken.tokenContractAddress.toLowerCase() !== q.inputToken.toLowerCase() ||
      rr.toToken.tokenContractAddress.toLowerCase() !== q.outputToken.toLowerCase() ||
      new Decimal(tx.slippagePercent).mul(100).gt(p.maxSlippageBps) ||
      BigInt(tx.minReceiveAmount) <
        (BigInt(q.amountOutRaw) * BigInt(10000 - p.maxSlippageBps)) / 10000n
    )
      throw new ApiError(
        'SWAP_MISMATCH',
        'Built transaction differs from the approved quote or slippage policy.',
      );
    const raw = await this.client.call(
      'Transaction',
      '/api/v1/dex/pre-transaction/simulate',
      simulationSchema,
      {},
      { binanceChainId: '56', evmTx: { from: tx.from, to: tx.to, value: tx.value, data: tx.data } },
    );
    const success = simulationMatches(raw, q, wallet);
    return {
      success,
      kind: 'binance',
      error: success
        ? undefined
        : (raw.failReason ??
          'Simulation changes do not match intended tokens, amounts, or allowance constraints.'),
      transaction: tx,
      raw,
    };
  }
}
