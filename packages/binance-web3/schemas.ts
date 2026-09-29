import { z } from 'zod';
import { address, decimal, positive, txSchema } from '../core/domain';
const raw = z.string().regex(/^\d+$/);
const decimals = z
  .union([z.number().int(), z.string().regex(/^\d+$/)])
  .transform(Number)
  .pipe(z.number().int().min(0).max(36));
export const statusSchema = z.object({
  openState: z.boolean(),
  marketStatus: z.enum(['premarket', 'regular', 'postmarket', 'overnight', 'closed', 'pause']),
  reasonCode: z.string().nullish(),
  reasonMsg: z.string().nullish(),
  nextOpenTime: z.number().nullish(),
});
export const tokensSchema = z.array(
  z.object({
    binanceChainId: z.string(),
    tokenContractAddress: address,
    platformId: z.string(),
    assetType: z.number().int(),
    tokenSymbol: z.string(),
    decimals,
    underlyingTicker: z.string(),
    underlyingName: z.string(),
    tokenToShareRatio: positive,
    statusInfo: statusSchema,
    tokenPrice: decimal.nullish(),
    referencePrice: decimal.nullish(),
  }),
);
export const searchSchema = z.array(
  z.object({
    ticker: z.string(),
    companyName: z.string(),
    assets: z.array(
      z
        .object({
          platformId: z.string(),
          binanceChainId: z.string(),
          tokenContractAddress: z.string(),
          tokenSymbol: z.string(),
        })
        .refine(
          (a) => a.binanceChainId !== '56' || address.safeParse(a.tokenContractAddress).success,
          'Invalid BSC token address',
        ),
    ),
  }),
);
export const pricesSchema = z.array(
  z.object({
    binanceChainId: z.string(),
    tokenContractAddress: address,
    tokenPrice: decimal,
    referencePrice: decimal,
    tokenPriceUpdatedAt: z.number().int(),
  }),
);
export const underlyingSchema = z.object({
  binanceChainId: z.string(),
  tokenContractAddress: address,
  statusInfo: statusSchema,
  marketData: z.object({ referencePrice: decimal.nullish() }),
});
const tokenMeta = z.object({
  tokenContractAddress: address,
  tokenSymbol: z.string(),
  tokenUnitPrice: positive,
  decimal: decimals,
  isHoneyPot: z.boolean(),
  taxRate: decimal,
});
export const routeSchema = z.object({
  quoteId: z.string(),
  vendorName: z.string(),
  binanceChainId: z.literal('56'),
  fromTokenAmount: raw,
  toTokenAmount: raw,
  tradeFee: decimal.nullish(),
  priceImpactPercent: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/)
    .nullish(),
  fromToken: tokenMeta,
  toToken: tokenMeta,
  executionMode: z.enum(['SWAP', 'RFQ']),
  approveTarget: address.nullish(),
});
export const quotesSchema = z.array(routeSchema);
export const swapSchema = z.object({
  executionMode: z.enum(['SWAP', 'RFQ']),
  routerResult: routeSchema.omit({ quoteId: true, executionMode: true, approveTarget: true }),
  tx: txSchema.extend({ minReceiveAmount: raw, slippagePercent: decimal }).nullish(),
  rfq: z.unknown().optional(),
});
export const simulationSchema = z.object({
  status: z.enum(['SUCCESS', 'FAILED']),
  failReason: z.string().nullish(),
  balanceChanges: z.array(
    z.object({ contractAddress: z.string(), owner: address, change: z.string().regex(/^-?\d+$/) }),
  ),
  allowanceChanges: z.array(
    z.object({
      tokenAddress: address,
      owner: address,
      spender: address,
      preAmount: raw,
      postAmount: raw,
    }),
  ),
});
export const balanceSchema = z.array(
  z.object({
    page: z.number(),
    pageSize: z.number(),
    tokenAssets: z.array(
      z.object({
        binanceChainId: z.string(),
        tokenContractAddress: z.string(),
        address: address,
        symbol: z.string(),
        balance: decimal,
        rawBalance: z.string(),
        tokenPrice: decimal,
        isRiskToken: z.boolean(),
      }),
    ),
  }),
);
