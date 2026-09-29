import { z } from 'zod';
import Decimal from 'decimal.js';
Decimal.set({ precision: 60 });
export const decimal = z
  .string()
  .regex(/^\d+(\.\d+)?$/)
  .max(80);
export const positive = decimal.refine((v) => new Decimal(v).gt(0), 'Amount must be positive');
export const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const modeSchema = z.enum(['quote', 'simulate', 'live']);
export const policySchema = z
  .object({
    ticker: z.string().trim().min(1).max(80),
    side: z.enum(['buy', 'sell']).default('buy'),
    amount: positive,
    denomination: z.enum(['USDT', 'TOKEN']).default('USDT'),
    maxSlippageBps: z.number().int().min(0).max(500).default(50),
    maxReferenceDeviationBps: z.number().int().min(0).max(1000).default(100),
    maxReferenceAgeSeconds: z.number().int().min(1).max(86400).default(300),
    allowWhenReferenceStale: z.boolean().default(false),
    executionMode: modeSchema.default('simulate'),
    sellTokenAddress: address.optional(),
  })
  .superRefine((p, c) => {
    if (p.side === 'sell' && p.denomination !== 'TOKEN')
      c.addIssue({ code: 'custom', message: 'Sell amounts must be denominated in TOKEN' });
    if (p.side === 'buy' && p.denomination !== 'USDT')
      c.addIssue({ code: 'custom', message: 'Buy amounts must be denominated in USDT' });
  });
export type Policy = z.infer<typeof policySchema>;
export type TradeIntent = Policy & { id: string; createdAt: string; userText?: string };
export type Provider = 'bstocks' | 'ondo' | 'xstocks' | 'unknown';
export interface Representation {
  ticker: string;
  companyName: string;
  provider: Provider;
  chain: 'bsc';
  tokenAddress: string;
  symbol: string;
  decimals: number;
  sharesPerToken: string;
  tradable: boolean;
  status: string;
  sourceTimestamp: string;
  demo: boolean;
}
export interface Market {
  tokenAddress: string;
  onchainPrice?: string;
  onchainTimestamp?: string;
  derivedReferencePrice?: string;
  referencePrice?: string;
  referenceTimestamp?: string;
  referenceSource?: string;
  marketStatus: string;
  nextMarketOpen?: string;
  observedAt: string;
}
export interface Quote {
  id: string;
  vendor: string;
  executionMode: 'SWAP' | 'RFQ';
  inputToken: string;
  outputToken: string;
  amountIn: string;
  amountInRaw: string;
  expectedAmountOut: string;
  amountOutRaw: string;
  outputDecimals: number;
  inputPriceUsd: string;
  outputPriceUsd: string;
  gasUsd?: string;
  slippageBps: number;
  priceImpactBps?: number;
  quotedAt: string;
  expiresAt: string;
  raw?: unknown;
}
export const txSchema = z.object({
  from: address,
  to: address,
  value: z.string().regex(/^\d+$/),
  data: z.string().regex(/^0x([0-9a-fA-F]{2})*$/),
});
export type Transaction = z.infer<typeof txSchema>;
export interface Simulation {
  success: boolean;
  kind: 'demo' | 'binance' | 'unavailable';
  error?: string;
  transaction?: Transaction;
  raw?: unknown;
}
export interface RiskCheck {
  code: string;
  label: string;
  status: 'pass' | 'fail' | 'warn';
  observed?: string | number;
  threshold?: string | number;
  explanation: string;
}
export interface Evaluation {
  id: string;
  representation: Representation;
  market: Market;
  quote?: Quote;
  simulation?: Simulation;
  checks: RiskCheck[];
  eligible: boolean;
  rejectionReasons: string[];
  netOutput?: string;
  grossShares?: string;
  executionPrice?: string;
  deviationBps?: number;
  durationMs: number;
}
export interface Receipt {
  id: string;
  intent: TradeIntent;
  dataMode: 'demo' | 'live';
  candidates: Evaluation[];
  selectedRouteId?: string;
  decision: 'approved' | 'blocked';
  executed: boolean;
  status: 'quoted' | 'simulated' | 'blocked' | 'pending' | 'confirmed' | 'reverted';
  transactionHash?: string;
  actualAmountOut?: string;
  verification?: 'pending' | 'passed' | 'mismatch';
  blockExplorerUrl?: string;
  reason: string;
  createdAt: string;
  timeline: { label: string; at: string; durationMs: number }[];
}
export interface DataAdapter {
  mode: 'demo' | 'live';
  discover(query: string): Promise<Representation[]>;
  market(r: Representation): Promise<Market>;
  quotes(p: Policy, r: Representation, wallet?: string): Promise<Quote[]>;
  simulate(p: Policy, r: Representation, q: Quote, wallet?: string): Promise<Simulation>;
}
export const scenarioSchema = z.enum([
  'successful-best-execution',
  'policy-block',
  'stale-reference',
  'simulation-failure',
]);
export type Scenario = z.infer<typeof scenarioSchema>;
export function toRaw(amount: string, decimals: number): string {
  const n = new Decimal(amount).mul(new Decimal(10).pow(decimals));
  if (!n.isInteger()) throw new Error('Amount exceeds token precision');
  return n.toFixed(0);
}
export function fromRaw(amount: string, decimals: number): string {
  return new Decimal(amount).div(new Decimal(10).pow(decimals)).toFixed();
}
export function deviationBps(price?: string, reference?: string): number | undefined {
  if (!price || !reference || !new Decimal(reference).gt(0) || !new Decimal(price).gt(0)) return;
  return new Decimal(price).minus(reference).abs().div(reference).mul(10000).ceil().toNumber();
}
export function percentToBps(value: string): number {
  const d = new Decimal(value).mul(100);
  if (!d.isInteger()) throw new Error('Use percentages with at most two decimal places');
  return d.toNumber();
}
