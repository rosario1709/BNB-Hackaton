import { z } from 'zod';
import Decimal from 'decimal.js';
import { BinanceClient, ApiError } from '../binance-web3/client';
import {
  tokensSchema,
  searchSchema,
  pricesSchema,
  underlyingSchema,
  quoteBatchSchema,
  swapSchema,
  simulationSchema,
} from '../binance-web3/schemas';
import {
  address,
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
import { independentReference, referenceConfiguration } from './reference';

export function normalizeMarketStatus(status: {
  marketStatus?: string | null;
  openState: boolean;
  reasonCode?: string | null;
}): string {
  return status.marketStatus ||
    (status.openState && status.reasonCode === 'TRADING' ? 'active' : 'unknown');
}

export function simulationMatches(
  raw: z.infer<typeof simulationSchema>,
  q: Quote,
  wallet: string,
): boolean {
  const changes = raw.balanceChanges.filter(
    (c) => c.owner.toLowerCase() === wallet.toLowerCase(),
  );

  const delta = (token: string) =>
    changes
      .filter(
        (c) =>
          c.contractAddress.toLowerCase() === token.toLowerCase(),
      )
      .reduce(
        (sum, c) => sum + BigInt(c.change),
        0n,
      );

  const policyMinimum =
    (BigInt(q.amountOutRaw) *
      BigInt(10000 - q.slippageBps)) /
    10000n;
  const builtMinimum = BigInt(q.minReceiveAmountRaw ?? '0');
  const minimum = builtMinimum > policyMinimum ? builtMinimum : policyMinimum;

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
        ].includes(c.contractAddress.toLowerCase()) ||
        BigInt(c.change) >= 0n,
    )
  );
}

export class LiveAdapter implements DataAdapter {
  readonly mode = 'live' as const;
  private failures = new Map<string, { vendor: string; reason: string }[]>();
  quoteFailures(r: Representation) { return this.failures.get(r.tokenAddress) ?? []; }

  constructor(
    public client = new BinanceClient(),
  ) {}

  async discover(
    query: string,
  ): Promise<Representation[]> {
    const [tokens, matches] = await Promise.all([
      this.client.call(
        'RWA',
        '/api/v1/dex/market/rwa/tokens',
        tokensSchema,
        {
          binanceChainId: '56',
        },
      ),

      query
        ? this.client.call(
            'RWA',
            '/api/v1/dex/market/rwa/search',
            searchSchema,
            {
              keyword: query,
            },
          )
        : Promise.resolve(undefined),
    ]);

    const exact = matches?.filter(
      (match) =>
        match.ticker.toUpperCase() ===
        query.toUpperCase(),
    );

    const selected =
      exact?.length
        ? exact
        : matches;

    const allowed = selected
      ? new Set(
          selected.flatMap((match) =>
            match.assets
              .filter(
                (asset) =>
                  asset.binanceChainId === '56',
              )
              .map((asset) =>
                asset.tokenContractAddress.toLowerCase(),
              ),
          ),
        )
      : undefined;

    return tokens
      .filter(
        (token) =>
          token.binanceChainId === '56' &&
          token.assetType === 1 &&
          (!allowed ||
            allowed.has(
              token.tokenContractAddress.toLowerCase(),
            )),
      )
      .map((token): Representation => {
        const marketStatus =
          normalizeMarketStatus(token.statusInfo);

        return {
          ticker: token.underlyingTicker,

          companyName:
            token.underlyingName ??
            token.underlyingTicker,

          provider:
            (
              {
                ondo: 'ondo',
                bstock: 'bstocks',
                xstock: 'xstocks',
                xstocks: 'xstocks',
              } as Record<string, Provider>
            )[token.platformId] ?? 'unknown',

          chain: 'bsc',

          tokenAddress:
            token.tokenContractAddress,

          symbol: token.tokenSymbol,

          decimals: token.decimals,

          sharesPerToken:
            token.tokenToShareRatio,

          tradable:
            token.statusInfo.openState &&
            (
              !token.statusInfo.reasonCode ||
              token.statusInfo.reasonCode ===
                'TRADING'
            ),

          status: marketStatus,

          sourceTimestamp:
            new Date().toISOString(),

          demo: false,
        };
      });
  }

  async market(
    r: Representation,
  ): Promise<Market> {
    const [prices, underlying] =
      await Promise.all([
        this.client.call(
          'Market',
          '/api/v1/dex/market/rwa/price',
          pricesSchema,
          {
            binanceChainId: '56',
            tokenContractAddresses:
              r.tokenAddress,
          },
        ),

        this.client.call(
          'RWA',
          '/api/v1/dex/market/rwa/underlying-market',
          underlyingSchema,
          {
            binanceChainId: '56',
            tokenContractAddress:
              r.tokenAddress,
          },
        ),
      ]);

    const price = prices.find(
      (p) =>
        p.binanceChainId === '56' &&
        p.tokenContractAddress.toLowerCase() ===
          r.tokenAddress.toLowerCase(),
    );

    if (
      underlying.binanceChainId !== '56' ||
      underlying.tokenContractAddress.toLowerCase() !==
        r.tokenAddress.toLowerCase()
    ) {
      throw new ApiError(
        'TOKEN_MISMATCH',
        'RWA response does not match the requested token.',
      );
    }

    const marketStatus =
      normalizeMarketStatus(underlying.statusInfo);

    r.tradable =
      underlying.statusInfo.openState &&
      (
        !underlying.statusInfo.reasonCode ||
        underlying.statusInfo.reasonCode ===
          'TRADING'
      );

    r.status = marketStatus;

    const market: Market = {
      tokenAddress: r.tokenAddress,

      onchainPrice:
        price?.tokenPrice ?? undefined,

      onchainTimestamp:
        price
          ? new Date(
              price.tokenPriceUpdatedAt,
            ).toISOString()
          : undefined,

      derivedReferencePrice:
        price?.referencePrice ?? undefined,

      marketStatus,

      nextMarketOpen:
        underlying.statusInfo.nextOpenTime
          ? new Date(
              underlying.statusInfo.nextOpenTime,
            ).toISOString()
          : undefined,

      observedAt:
        new Date().toISOString(),
    };

    try {
      const reference = await independentReference(r.ticker);
      if (reference) {
      market.referencePrice = reference.price;
      market.referenceTimestamp = reference.timestamp;
      market.referenceSource = reference.source;
      market.referenceIndependent = true;
      market.referenceCurrency = reference.currency;
      market.referenceExchange = reference.exchange;
      } else market.referenceError = referenceConfiguration().message;
    } catch {
      market.referenceError = referenceConfiguration().message ?? 'Independent stock reference failed. Check credentials, subscription and source response; inspect Reference telemetry.';
    }

    return market;
  }

  async quotes(
    p: Policy,
    r: Representation,
    wallet?: string,
  ): Promise<Quote[]> {
    const usdt = address.safeParse(
      process.env.ATLAS_USDT_ADDRESS,
    );

    if (!usdt.success) {
      throw new ApiError(
        'USDT_NOT_CONFIGURED',
        'Set a verified BSC USDT contract in ATLAS_USDT_ADDRESS.',
      );
    }

    const usdtDecimals = z.coerce
      .number()
      .int()
      .min(0)
      .max(36)
      .parse(
        process.env
          .ATLAS_USDT_DECIMALS ?? 18,
      );

    const input =
      p.side === 'buy'
        ? usdt.data
        : r.tokenAddress;

    const output =
      p.side === 'buy'
        ? r.tokenAddress
        : usdt.data;

    const raw = toRaw(
      p.amount,
      p.side === 'buy'
        ? usdtDecimals
        : r.decimals,
    );

    if (!wallet) {
      throw new ApiError(
        'WALLET_DISCONNECTED',
        'Connect a wallet to obtain receiver-bound tokenized-equity quotes.',
      );
    }

    const began = Date.now();

    const batch =
      await this.client.call(
        'Trading',
        '/api/v1/dex/aggregator/quote',
        quoteBatchSchema,
        {
          binanceChainId: '56',

          amount: raw,

          fromTokenAddress:
            input,

          toTokenAddress:
            output,

          userWalletAddress:
            address.parse(wallet),
        },
      );

    const rejected: ApiError[] = [];
    const failures = [...batch.rejected];
    this.failures.set(r.tokenAddress, failures);
    const accepted = batch.routes.flatMap(
      (quote): Quote[] => {
        const fail = (error: ApiError) => { rejected.push(error); failures.push({ vendor: quote.vendorName, reason: `${error.code}: ${error.message}` }); };
        if (
          quote.fromToken.tokenContractAddress.toLowerCase() !==
            input.toLowerCase() ||
          quote.toToken.tokenContractAddress.toLowerCase() !==
            output.toLowerCase() ||
          quote.fromTokenAmount !== raw ||
          quote.fromToken.decimal !==
            (
              p.side === 'buy'
                ? usdtDecimals
                : r.decimals
            ) ||
          quote.toToken.decimal !==
            (
              p.side === 'buy'
                ? r.decimals
                : usdtDecimals
            )
        ) {
          fail(new ApiError(
            'QUOTE_MISMATCH',
            'Quote token, amount, or decimals do not match the request.',
          ));
          return [];
        }

        if (
          quote.fromToken.isHoneyPot ||
          quote.toToken.isHoneyPot ||
          new Decimal(
            quote.fromToken.taxRate,
          ).gt(0) ||
          new Decimal(
            quote.toToken.taxRate,
          ).gt(0)
        ) {
          fail(new ApiError(
            'UNSAFE_TOKEN',
            'Honeypot or taxed tokens are unsupported.',
          ));
          return [];
        }

        const echoedWallet = quote.userWalletAddress ?? quote.recipient;
        if ((echoedWallet !== undefined && (typeof echoedWallet !== 'string' || echoedWallet.toLowerCase() !== wallet.toLowerCase())) || BigInt(quote.toTokenAmount) <= 0n) {
          fail(new ApiError('QUOTE_MISMATCH', 'Quote recipient or positive output does not match the request.'));
          return [];
        }
        return [{
          id: quote.quoteId,

          vendor:
            quote.vendorName,

          executionMode:
            quote.executionMode,

          inputToken: input,

          outputToken: output,
          approveTarget: quote.approveTarget,

          amountIn: p.amount,
          recipient: wallet,
          inputDecimals: quote.fromToken.decimal,
          minReceiveAmountRaw: ((BigInt(quote.toTokenAmount) * BigInt(10000 - p.maxSlippageBps)) / 10000n).toString(),
          tradeFeeUsd: quote.tradeFee ?? undefined,

          amountInRaw: raw,

          expectedAmountOut:
            fromRaw(
              quote.toTokenAmount,
              quote.toToken.decimal,
            ),

          amountOutRaw:
            quote.toTokenAmount,

          outputDecimals:
            quote.toToken.decimal,

          inputPriceUsd:
            quote.fromToken.tokenUnitPrice,

          outputPriceUsd:
            quote.toToken.tokenUnitPrice,

          gasUsd:
            quote.tradeFee ??
            undefined,

          // This is the configured user limit,
          // not observed slippage.
          slippageBps:
            p.maxSlippageBps,

          priceImpactBps:
            quote.priceImpactPercent ==
            null
              ? undefined
              : new Decimal(
                  quote.priceImpactPercent,
                )
                  .abs()
                  .mul(100)
                  .ceil()
                  .toNumber(),

          quotedAt:
            new Date(
              began,
            ).toISOString(),

          expiresAt:
            new Date(
              began + 25000,
            ).toISOString(),

          raw: quote,
        }];
      },
    );
    if (!accepted.length && rejected.length && !failures.length) throw rejected[0];
    return accepted;
  }

  async simulate(
    p: Policy,
    r: Representation,
    q: Quote,
    wallet?: string,
  ): Promise<Simulation> {
    if (!wallet) {
      return {
        success: false,

        kind: 'unavailable',

        error:
          'Connect a wallet before simulation.',
      };
    }

    /*
     * Current ATLAS build intentionally blocks
     * RFQ settlement until the RFQ signing /
     * settlement path is implemented.
     */
    if (q.executionMode === 'RFQ') {
      return {
        success: false,

        kind: 'unavailable',

        error:
          'RFQ settlement requires the dedicated RFQ signing and settlement flow. ATLAS currently blocks execution until that flow is implemented.',
      };
    }

    const swap =
      await this.client.call(
        'Trading',
        '/api/v1/dex/aggregator/swap',
        swapSchema,
        {
          binanceChainId: '56',

          amount:
            q.amountInRaw,

          fromTokenAddress:
            q.inputToken,

          toTokenAddress:
            q.outputToken,

          userWalletAddress:
            wallet,

          quoteId: q.id,

          slippagePercent:
            new Decimal(
              p.maxSlippageBps,
            )
              .div(100)
              .toFixed(),

          autoSlippage:
            'false',

          priceImpactProtectionPercent:
            new Decimal(
              p.maxSlippageBps,
            )
              .div(100)
              .toFixed(),
        },
      );

    const tx = swap.tx;
    const routerResult =
      swap.routerResult;

    if (
      !tx ||
      swap.executionMode !==
        'SWAP' ||
      tx.from.toLowerCase() !==
        wallet.toLowerCase() ||
      tx.value !== '0' ||
      routerResult.fromTokenAmount !==
        q.amountInRaw ||
      routerResult.toTokenAmount !==
        q.amountOutRaw ||
      routerResult.vendorName !== q.vendor ||
      routerResult.fromToken.decimal !== q.inputDecimals ||
      routerResult.toToken.decimal !== q.outputDecimals ||
      routerResult.fromToken.isHoneyPot || routerResult.toToken.isHoneyPot ||
      new Decimal(routerResult.fromToken.taxRate).gt(0) || new Decimal(routerResult.toToken.taxRate).gt(0) ||
      q.recipient?.toLowerCase() !== wallet.toLowerCase() ||
      tx.data === '0x' ||
      routerResult.fromToken.tokenContractAddress.toLowerCase() !==
        q.inputToken.toLowerCase() ||
      routerResult.toToken.tokenContractAddress.toLowerCase() !==
        q.outputToken.toLowerCase() ||
      new Decimal(
        tx.slippagePercent,
      )
        .mul(100)
        .gt(p.maxSlippageBps) ||
      BigInt(
        tx.minReceiveAmount,
      ) <
        (
          BigInt(q.amountOutRaw) *
          BigInt(
            10000 -
              p.maxSlippageBps,
          )
        ) /
          10000n
    ) {
      throw new ApiError(
        'SWAP_MISMATCH',
        'Built transaction differs from the approved quote or slippage policy.',
      );
    }
    if (Date.now() >= Date.parse(q.expiresAt)) throw new ApiError('QUOTE_EXPIRED', 'Quote expired before simulation. Re-evaluate.');
    q.minReceiveAmountRaw = tx.minReceiveAmount;

    const raw =
      await this.client.call(
        'Transaction',
        '/api/v1/dex/pre-transaction/simulate',
        simulationSchema,
        {},
        {
          binanceChainId:
            '56',

          evmTx: {
            from:
              tx.from,

            to:
              tx.to,

            value:
              tx.value,

            data:
              tx.data,
          },
        },
      );

    const success =
      simulationMatches(
        raw,
        q,
        wallet,
      );

    return {
      success,

      kind: 'binance',

      error:
        success
          ? undefined
          : (
              raw.failReason ??
              'Simulation changes do not match intended tokens, amounts, or allowance constraints.'
            ),

      transaction: tx,

      raw,
    };
  }
}
