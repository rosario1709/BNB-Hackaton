import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import Decimal from 'decimal.js';
import { config } from '../../../../../packages/core/config';
import { address, policySchema } from '../../../../../packages/core/domain';
import { parseIntent } from '../../../../../packages/core/policy';
import { adapter, evaluate } from '../../../../../packages/agent/service';
import {
  getReceipt,
  listReceipts,
  saveReceipt,
  databaseHealth,
  claimExecution,
  getExecution,
} from '../../../../../packages/db';
import { observations, summary } from '../../../../../packages/telemetry';
import { BinanceClient, ApiError } from '../../../../../packages/binance-web3/client';
import { balanceSchema } from '../../../../../packages/binance-web3/schemas';
import { prepareTransaction, verifyTransaction } from '../../../../../packages/execution';
import { PublicMarketAdapter } from '../../../../../packages/market/public';
import { summarizePortfolio } from '../../../../../packages/market/portfolio';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const limits = new Map<string, { count: number; until: number }>();
function agentAuth(request: NextRequest) {
  const expected = process.env.ATLAS_AGENT_TOKEN,
    actual = request.headers.get('authorization')?.replace(/^Bearer /, '');
  if (
    !expected ||
    !actual ||
    expected.length < 32 ||
    Buffer.byteLength(expected) !== Buffer.byteLength(actual) ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
  )
    throw new ApiError('UNAUTHORIZED', 'A configured agent bearer token is required.', 401);
}
async function handle(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join('/'),
    cfg = config();
  const existing = request.cookies.get('atlas_session')?.value;
  const owner = existing && z.uuid().safeParse(existing).success ? existing : crypto.randomUUID();
  const send = (data: unknown, status = 200) => {
    const response = NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
    if (owner !== existing)
      response.cookies.set('atlas_session', owner, {
        httpOnly: true,
        sameSite: 'strict',
        secure: request.nextUrl.protocol === 'https:',
        path: '/',
        maxAge: 86400 * 30,
      });
    return response;
  };
  try {
    if (request.method === 'POST') {
      const origin = request.headers.get('origin');
      if (origin && origin !== request.nextUrl.origin && origin !== process.env.NEXT_PUBLIC_APP_URL)
        throw new ApiError('ORIGIN', 'Cross-origin write rejected.', 403);
      const key = owner;
      const now = Date.now();
      if (limits.size > 2000) for (const [k, v] of limits) if (v.until < now) limits.delete(k);
      const limit = limits.get(key);
      if (limit && limit.until > now) {
        if (++limit.count > 20)
          throw new ApiError('RATE_LIMIT', 'Too many requests. Wait one minute.', 429);
      } else limits.set(key, { count: 1, until: now + 60000 });
    }
    if (request.method === 'GET') {
      if (path === 'health')
        return send({
          ok: true,
          app: 'ATLAS',
          mode: cfg.demo ? 'demo' : 'live',
          timestamp: new Date().toISOString(),
        });
      if (path === 'system/status')
        return send({
          mode: cfg.demo ? 'demo' : 'live',
          liveEnabled: cfg.liveEnabled,
          credentials: cfg.credentials,
          persistence: await databaseHealth(),
          maxTrade: cfg.maxTrade,
          telemetry: summary(),
          integrations: [
            ...['RWA', 'Market', 'Trading', 'Transaction', 'Wallet', 'Wallet Skills'].map(
              (name) => ({
                name,
                status: observations.some((e) => e.module === name && e.success)
                  ? 'Observed successful call'
                  : cfg.credentials
                    ? 'Configured · not verified'
                    : 'Not configured',
              }),
            ),
            {
              name: 'Agentic Wallet',
              status: process.env.ATLAS_BAW_EXECUTABLE
                ? 'Local CLI path configured · authorization not verified'
                : 'Not configured',
            },
            { name: 'Agent Studio', status: 'Not deployed · runWork integration available' },
            { name: 'b402 / x402', status: 'Not configured' },
          ],
          agent: { id: null, runtime: null },
          observations: observations.slice(-30),
        });
      if (path === 'markets' || path.startsWith('markets/')) {
        const query = z
          .string()
          .max(80)
          .parse(
            path.startsWith('markets/')
              ? decodeURIComponent(path.slice(8))
              : (request.nextUrl.searchParams.get('q') ?? ''),
          );
        const service =
          request.nextUrl.searchParams.get('source') === 'public'
            ? new PublicMarketAdapter()
            : adapter();
        const reps = await service.discover(query);
        const rows = [];
        for (let i = 0; i < Math.min(reps.length, 60); i += 3) {
          const batch = await Promise.allSettled(
            reps
              .slice(i, i + 3)
              .map(async (r) => ({ representation: r, market: await service.market(r) })),
          );
          for (let j = 0; j < batch.length; j++) {
            const value = batch[j];
            rows.push(
              value.status === 'fulfilled'
                ? value.value
                : {
                    representation: reps[i + j],
                    error: 'Market data unavailable for this representation.',
                  },
            );
          }
        }
        return send({ mode: service.mode, rows, total: reps.length, limited: reps.length > 60 });
      }
      if (path === 'receipts')
        return send({ receipts: await listReceipts(owner), temporary: !cfg.persistent });
      if (path.startsWith('executions/')) {
        const receipt = await getReceipt(owner, path.slice(11));
        return receipt
          ? send(receipt)
          : send({ error: 'Receipt not found in this browser session.' }, 404);
      }
      if (path === 'portfolio') {
        const wallet = address.parse(request.nextUrl.searchParams.get('address'));
        if (cfg.demo)
          return send({
            mode: 'demo',
            assets: [],
            notice: 'Demo mode does not fabricate wallet balances.',
          });
        const data = await new BinanceClient().call(
          'Wallet',
          '/api/v1/dex/balance/all-token-balances-by-address',
          balanceSchema,
          { address: wallet, chains: '56', excludeRiskToken: 'true', page: '1', pageSize: '100' },
        );
        const assets = data
          .flatMap((p) => p.tokenAssets)
          .filter(
            (a) => a.binanceChainId === '56' && a.address.toLowerCase() === wallet.toLowerCase(),
          );
        const representations = await adapter().discover('');
        return send({
          mode: 'live',
          assets,
          ...summarizePortfolio(assets, representations),
          recentExecutions: (await listReceipts(owner)).filter((r) => r.executed).slice(0, 5),
          notice: 'First 100 balances; prices are supplied by Binance.',
        });
      }
    }
    if (request.method === 'POST') {
      const text = await request.text();
      if (text.length > 12000) throw new ApiError('BODY_TOO_LARGE', 'Request exceeds 12 KB.', 413);
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        throw new ApiError('INVALID_JSON', 'Provide a valid JSON body.', 400);
      }
      if (path === 'intent/parse') {
        const input = z.object({ text: z.string().min(1).max(2000) }).parse(body);
        return send({ policy: parseIntent(input.text), compiler: 'deterministic' });
      }
      if (path === 'routes/evaluate' || path === 'routes/simulate')
        return send(await evaluate(body, owner));
      if (path === 'agent/best-execution') {
        agentAuth(request);
        const input = policySchema.parse(body);
        if (input.executionMode === 'live')
          throw new ApiError('READ_ONLY', 'The intelligence agent cannot execute trades.', 400);
        return send(await evaluate({ policy: input }, 'agent'));
      }
      if (path === 'execute') {
        const input = z
          .object({ receiptId: z.uuid(), wallet: address, confirmed: z.literal(true) })
          .parse(body);
        if (!cfg.liveEnabled || cfg.demo)
          throw new ApiError(
            'LIVE_DISABLED',
            'Mainnet execution is disabled. Demo funds never move.',
            403,
          );
        if (!cfg.persistent)
          throw new ApiError(
            'DATABASE_REQUIRED',
            'Configure PostgreSQL before enabling live execution.',
            503,
          );
        const old = await getReceipt(owner, input.receiptId);
        if (!old) throw new ApiError('NOT_FOUND', 'Receipt not found.', 404);
        if (old.decision !== 'approved')
          throw new ApiError(
            'POLICY_REJECTED',
            'A rejected policy cannot be submitted. Review a new approved report.',
            403,
          );
        if (old.intent.executionMode !== 'live')
          throw new ApiError('MODE', 'Quote and simulation receipts cannot execute.', 403);
        const fresh = await evaluate({ policy: old.intent, wallet: input.wallet }, owner);
        const previous = old.candidates.find((c) => c.id === old.selectedRouteId),
          next = fresh.candidates.find((c) => c.id === fresh.selectedRouteId);
        if (
          !previous?.quote ||
          !next?.quote ||
          previous.representation.tokenAddress.toLowerCase() !==
            next.representation.tokenAddress.toLowerCase() ||
          previous.quote.vendor !== next.quote.vendor ||
          new Decimal(next.quote.expectedAmountOut).lt(
            new Decimal(previous.quote.expectedAmountOut).mul(
              new Decimal(1).minus(new Decimal(old.intent.maxSlippageBps).div(10000)),
            ),
          )
        )
          throw new ApiError(
            'ROUTE_CHANGED',
            'The selected route or output changed. Review a new evaluation before confirming.',
            409,
          );
        const transaction = await prepareTransaction(fresh, input.wallet, input.confirmed);
        await claimExecution(owner, old.intent.id, transaction, fresh.id, next.quote.expiresAt);
        return send({
          transaction,
          chainId: 56,
          receipt: fresh,
          executionId: old.intent.id,
          expiresAt: next.quote.expiresAt,
        });
      }
      if (path === 'execute/verify') {
        const input = z
          .object({
            executionId: z.uuid(),
            transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
          })
          .parse(body);
        const prepared = await getExecution(owner, input.executionId);
        if (!prepared) throw new ApiError('NOT_FOUND', 'Prepared execution not found.', 404);
        const receipt = await getReceipt(owner, prepared.receiptId);
        if (!receipt) throw new ApiError('NOT_FOUND', 'Execution receipt not found.', 404);
        const verified = await verifyTransaction(
          receipt,
          prepared.transaction,
          input.transactionHash as `0x${string}`,
        );
        await saveReceipt(owner, verified);
        return send(verified);
      }
    }
    return send({ error: 'Endpoint not found' }, 404);
  } catch (error) {
    if (error instanceof z.ZodError)
      return send(
        {
          error: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          code: 'VALIDATION',
        },
        400,
      );
    if (error instanceof ApiError)
      return send({ error: error.message, code: error.code }, error.status);
    return send(
      {
        error:
          error instanceof Error &&
          !(error.message.includes('postgres') || error.message.includes('password'))
            ? error.message
            : 'Service unavailable. Check the server configuration.',
        code: 'REQUEST_FAILED',
      },
      400,
    );
  }
}
export const GET = handle;
export const POST = handle;
