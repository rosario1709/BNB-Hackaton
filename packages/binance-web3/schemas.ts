import { z } from 'zod';
import {
  address,
  decimal,
  positive,
  txSchema,
} from '../core/domain';

/**
 * Integer amount represented by Binance as a raw token amount.
 */
const raw = z.string().regex(/^\d+$/);

/**
 * Binance sometimes returns decimals as a number
 * and sometimes as a numeric string.
 */
const decimals = z
  .union([
    z.number().int(),
    z.string().regex(/^\d+$/),
  ])
  .transform(Number)
  .pipe(
    z
      .number()
      .int()
      .min(0)
      .max(36),
  );

/**
 * Binance timestamps may arrive as numbers or numeric strings.
 */
const integerTimestamp = z
  .union([
    z.number().int(),
    z
      .string()
      .regex(/^\d+$/)
      .transform(Number),
  ])
  .nullish();

/**
 * Market status returned by the RWA APIs.
 *
 * Real Binance responses have been observed with:
 * marketStatus = null
 *
 * Therefore the field is intentionally nullish.
 */
export const statusSchema = z
  .object({
    openState: z.boolean(),

    marketStatus: z
      .string()
      .nullish(),

    reasonCode: z
      .string()
      .nullish(),

    reasonMsg: z
      .string()
      .nullish(),

    nextOpenTime:
      integerTimestamp,

    nextCloseTime:
      integerTimestamp,
  })
  .passthrough();

/**
 * Complete tokenized-equity list.
 *
 * Only routing/security relevant fields are validated strictly.
 * Binance may add other informational fields.
 */
export const tokensSchema = z.array(
  z
    .object({
      binanceChainId:
        z.string(),

      tokenContractAddress:
        address,

      platformId:
        z.string(),

      /**
       * Some records returned by Binance have assetType = null.
       * ATLAS later filters specifically for assetType === 1.
       */
      assetType: z
        .union([
          z.number().int(),
          z
            .string()
            .regex(/^\d+$/)
            .transform(Number),
        ])
        .nullish(),

      tokenName: z
        .string()
        .nullish(),

      tokenSymbol:
        z.string(),

      tokenLogoUrl: z
        .string()
        .nullish(),

      decimals,

      underlyingTicker:
        z.string(),

      /**
       * Some non-equity records have no underlying name.
       */
      underlyingName: z
        .string()
        .nullish(),

      underlyingNameZh: z
        .string()
        .nullish(),

      tokenToShareRatio:
        positive,

      /**
       * Real API responses frequently return tags: null.
       */
      tags: z
        .array(z.string())
        .nullish(),

      statusInfo:
        statusSchema,

      tokenPrice:
        decimal.nullish(),

      referencePrice:
        decimal.nullish(),

      volume24H:
        decimal.nullish(),

      marketCap:
        decimal.nullish(),

      peRatioTTM:
        decimal.nullish(),
    })
    .passthrough(),
);

/**
 * RWA search.
 */
export const searchSchema = z.array(
  z
    .object({
      ticker:
        z.string(),

      companyName:
        z.string(),

      assets: z.array(
        z
          .object({
            platformId:
              z.string(),

            binanceChainId:
              z.string(),

            tokenContractAddress:
              z.string(),

            tokenSymbol:
              z.string(),

            assetType: z
              .union([
                z.number().int(),
                z
                  .string()
                  .regex(/^\d+$/)
                  .transform(Number),
              ])
              .nullish(),
          })
          .passthrough()
          .refine(
            (asset) =>
              asset.binanceChainId !==
                '56' ||
              address.safeParse(
                asset.tokenContractAddress,
              ).success,
            'Invalid BSC token address',
          ),
      ),
    })
    .passthrough(),
);

/**
 * RWA prices.
 */
export const pricesSchema = z.array(
  z
    .object({
      binanceChainId:
        z.string(),

      tokenContractAddress:
        address,

      platformId: z
        .string()
        .optional(),

      tokenPrice:
        decimal,

      referencePrice:
        decimal,

      tokenPriceUpdatedAt: z
        .union([
          z.number().int(),
          z
            .string()
            .regex(/^\d+$/)
            .transform(Number),
        ])
        .pipe(
          z
            .number()
            .int(),
        ),
    })
    .passthrough(),
);

/**
 * Underlying equity market information.
 */
export const underlyingSchema = z
  .object({
    binanceChainId:
      z.string(),

    tokenContractAddress:
      address,

    platformId: z
      .string()
      .optional(),

    underlyingTicker: z
      .string()
      .optional(),

    underlyingFullName: z
      .string()
      .nullish(),

    assetType: z
      .union([
        z.number().int(),
        z
          .string()
          .regex(/^\d+$/)
          .transform(Number),
      ])
      .nullish(),

    statusInfo:
      statusSchema,

    marketData: z
      .object({
        referencePrice:
          decimal.nullish(),

        high52W:
          decimal
            .nullish()
            .optional(),

        low52W:
          decimal
            .nullish()
            .optional(),

        volumeShares24H:
          decimal
            .nullish()
            .optional(),

        avgDailyVolume1Y:
          decimal
            .nullish()
            .optional(),

        totalShares:
          decimal
            .nullish()
            .optional(),

        marketCap:
          decimal
            .nullish()
            .optional(),

        turnoverRate:
          decimal
            .nullish()
            .optional(),

        amplitude:
          decimal
            .nullish()
            .optional(),

        peRatioTTM:
          decimal
            .nullish()
            .optional(),

        pbRatio:
          decimal
            .nullish()
            .optional(),

        dividendYield:
          decimal
            .nullish()
            .optional(),

        latestDividend:
          decimal
            .nullish()
            .optional(),
      })
      .passthrough(),
  })
  .passthrough();

/**
 * Token metadata in a Trading API route.
 */
const tokenMeta = z
  .object({
    tokenContractAddress:
      address,

    tokenSymbol:
      z.string(),

    tokenUnitPrice:
      positive,

    decimal:
      decimals,

    isHoneyPot:
      z.boolean(),

    taxRate:
      decimal,
  })
  .passthrough();

/**
 * Trading quote route.
 */
export const routeSchema = z
  .object({
    quoteId:
      z.string().min(1).max(200),

    vendorName:
      z.string().min(1).max(80),

    binanceChainId:
      z.literal('56'),

    fromTokenAmount:
      raw,

    toTokenAmount:
      raw,

    tradeFee:
      decimal.nullish(),

    priceImpactPercent: z
      .string()
      .regex(/^-?\d+(\.\d+)?$/)
      .nullish(),

    fromToken:
      tokenMeta,

    toToken:
      tokenMeta,

    executionMode:
      z.enum([
        'SWAP',
        'RFQ',
      ]),

    approveTarget:
      address.nullish(),
    recipient: address.optional(),
    userWalletAddress: address.optional(),
  })
  .passthrough();

/**
 * Trading API may return multiple competing vendors/routes.
 */
export const quotesSchema =
  z.array(routeSchema);

// Parse each vendor independently; retain a sanitized reason for rejected routes.
export const quoteBatchSchema = z.array(z.unknown()).transform((rows) => {
  const routes: z.infer<typeof routeSchema>[] = [];
  const rejected: { vendor: string; reason: string }[] = [];
  for (const row of rows) {
    const result = routeSchema.safeParse(row);
    if (result.success) routes.push(result.data);
    else {
      const name = z.object({ vendorName: z.string().max(80) }).safeParse(row);
      rejected.push({ vendor: name.success ? name.data.vendorName : 'Unknown vendor',
        reason: `MALFORMED_QUOTE: invalid ${result.error.issues.map((i) => i.path.join('.')).slice(0, 4).join(', ')}` });
    }
  }
  return { routes, rejected };
});

export const approvalSchema = z.array(
  z
    .object({
      data: z.string().regex(/^0x([0-9a-fA-F]{2})*$/),
      dexContractAddress: address,
      gasLimit: raw,
      gasPrice: raw,
    })
    .passthrough(),
);

/**
 * Swap/RFQ build response.
 */
export const swapSchema = z
  .object({
    executionMode:
      z.enum([
        'SWAP',
        'RFQ',
      ]),

    routerResult:
      routeSchema
        .omit({
          quoteId: true,
          executionMode: true,
          approveTarget: true,
        })
        .passthrough(),

    tx: txSchema
      .extend({
        minReceiveAmount:
          raw,

        slippagePercent:
          decimal,
      })
      .nullish(),

    rfq: z
      .unknown()
      .optional(),
  })
  .passthrough();

/**
 * Binance Transaction API simulation.
 */
export const simulationSchema = z
  .object({
    status:
      z.enum([
        'SUCCESS',
        'FAILED',
      ]),

    failReason:
      z
        .string()
        .nullish(),

    balanceChanges: z.array(
      z
        .object({
          contractAddress:
            z.string(),

          owner:
            address,

          change: z
            .string()
            .regex(/^-?\d+$/),
        })
        .passthrough(),
    ),

    allowanceChanges: z.array(
      z
        .object({
          tokenAddress:
            address,

          owner:
            address,

          spender:
            address,

          preAmount:
            raw,

          postAmount:
            raw,
        })
        .passthrough(),
    ),
  })
  .passthrough();

/**
 * Wallet API balances.
 */
export const balanceSchema = z.array(
  z
    .object({
      page:
        z.number(),

      pageSize:
        z.number(),

      tokenAssets: z.array(
        z
          .object({
            binanceChainId:
              z.string(),

            tokenContractAddress:
              z.string(),

            address:
              address,

            symbol:
              z.string(),

            balance:
              decimal,

            rawBalance:
              z.string(),

            tokenPrice:
              decimal,

            isRiskToken:
              z.boolean(),
          })
          .passthrough(),
      ),
    })
    .passthrough(),
);
