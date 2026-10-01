import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { LiveAdapter } from '../packages/market/live';
import { ApiError } from '../packages/binance-web3/client';
import { approvalSchema } from '../packages/binance-web3/schemas';
import { address, policySchema } from '../packages/core/domain';
import { rpc } from '../packages/execution';
import { encodeFunctionData, erc20Abi, type Address } from 'viem';

if (!process.env.BINANCE_WEB3_API_KEY || !process.env.BINANCE_WEB3_API_SECRET)
  throw new Error('Configure both Binance Web3 API credentials before verification.');
if (!address.safeParse(process.env.ATLAS_USDT_ADDRESS).success)
  throw new Error('Set an operator-verified BSC USDT contract in ATLAS_USDT_ADDRESS.');

const wallet = process.env.ATLAS_QUOTE_PROBE_WALLET
  ? address.parse(process.env.ATLAS_QUOTE_PROBE_WALLET)
  : `0x${randomBytes(20).toString('hex')}`;
const argumentsWithoutFlags = process.argv
  .slice(2)
  .filter((argument) => !['--simulate', '--approval'].includes(argument));
const policy = policySchema.parse({
  ticker: argumentsWithoutFlags[0] ?? 'NVDA',
  amount: argumentsWithoutFlags[1] ?? '10',
  executionMode: 'quote',
});
const adapter = new LiveAdapter();
const representations = await adapter.discover(policy.ticker);
const results = await Promise.allSettled(
  representations.map((representation) => adapter.quotes(policy, representation, wallet)),
);
const routes = results.map((result, index) => ({
  symbol: representations[index].symbol,
  provider: representations[index].provider,
  ...(result.status === 'fulfilled'
    ? {
        result: result.value.length ? 'verified' : 'no-valid-quotes',
        rejectedVendors: adapter.quoteFailures(representations[index]),
        quoteCount: result.value.length,
        vendors: result.value.map(({ vendor, executionMode, raw, id, inputToken, outputToken, amountInRaw, amountOutRaw, inputDecimals, outputDecimals, quotedAt, expiresAt, minReceiveAmountRaw, tradeFeeUsd }) => ({
          vendor,
          executionMode,
          quoteId: id, tokenIn: inputToken, tokenOut: outputToken, amountInRaw, amountOutRaw,
          inputDecimals, outputDecimals, quotedAt, expiresAt, minReceiveAmountRaw, tradeFeeUsd,
          approveTarget:
            (raw as { approveTarget?: string | null } | undefined)?.approveTarget ?? null,
        })),
      }
    : {
        result: 'failed',
        code: result.reason instanceof ApiError ? result.reason.code : 'QUOTE_ERROR',
      }),
}));
let simulationProbe:
  | {
      symbol: string;
      result: 'passed' | 'failed';
      kind: string;
      router?: string;
      routerHasCode?: boolean;
      rpcChainId?: number;
    }
  | { result: 'unavailable'; code: string }
  | undefined;
let approvalProbe:
  | { result: 'matched'; token: string; spender: string; amountRaw: string }
  | { result: 'unavailable' | 'mismatch'; code: string }
  | undefined;
if (process.argv.includes('--approval')) {
  const quote = results
    .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
    .find((candidate) => candidate.executionMode === 'SWAP' && candidate.raw);
  const spender = (quote?.raw as { approveTarget?: string | null } | undefined)?.approveTarget;
  if (!quote || !spender) {
    approvalProbe = { result: 'unavailable', code: 'NO_APPROVAL_TARGET' };
  } else {
    try {
      const rows = await adapter.client.call(
        'Trading',
        '/api/v1/dex/aggregator/approve-transaction',
        approvalSchema,
        {
          binanceChainId: '56',
          tokenContractAddress: quote.inputToken,
          approveAmount: quote.amountInRaw,
          vendor: quote.vendor,
        },
      );
      const expectedData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [spender as Address, BigInt(quote.amountInRaw)],
      });
      approvalProbe =
        rows.length === 1 &&
        rows[0].dexContractAddress.toLowerCase() === spender.toLowerCase() &&
        rows[0].data.toLowerCase() === expectedData.toLowerCase()
          ? {
              result: 'matched',
              token: quote.inputToken,
              spender,
              amountRaw: quote.amountInRaw,
            }
          : { result: 'mismatch', code: 'APPROVAL_DATA_MISMATCH' };
    } catch (error) {
      approvalProbe = {
        result: 'unavailable',
        code: error instanceof ApiError ? error.code : 'APPROVAL_ERROR',
      };
    }
  }
}
if (process.argv.includes('--simulate')) {
  const index = results.findIndex(
    (result) =>
      result.status === 'fulfilled' && result.value.some((quote) => quote.executionMode === 'SWAP'),
  );
  if (index < 0) {
    simulationProbe = { result: 'unavailable', code: 'NO_SWAP_QUOTE' };
  } else {
    const result = results[index];
    if (result.status === 'fulfilled') {
      const quote = result.value.find((candidate) => candidate.executionMode === 'SWAP')!;
      try {
        const simulation = await adapter.simulate(
          { ...policy, executionMode: 'simulate' },
          representations[index],
          quote,
          wallet,
        );
        const router = simulation.transaction?.to;
        let rpcChainId: number | undefined;
        let routerHasCode: boolean | undefined;
        if (router) {
          try {
            const client = rpc();
            const [chainId, code] = await Promise.all([
              client.getChainId(),
              client.getBytecode({ address: router as Address }),
            ]);
            rpcChainId = chainId;
            routerHasCode = !!code && code !== '0x';
          } catch {
            // RPC evidence remains unknown if the public node is unavailable.
          }
        }
        simulationProbe = {
          symbol: representations[index].symbol,
          result: simulation.success ? 'passed' : 'failed',
          kind: simulation.kind,
          router,
          routerHasCode,
          rpcChainId,
        };
      } catch (error) {
        simulationProbe = {
          result: 'unavailable',
          code: error instanceof ApiError ? error.code : 'SIMULATION_ERROR',
        };
      }
    }
  }
}
const evidence = {
  status: results.some((result) => result.status === 'fulfilled' && result.value.length > 0) &&
    (!process.argv.includes('--simulate') || simulationProbe?.result === 'passed') &&
    (!process.argv.includes('--approval') || approvalProbe?.result === 'matched') ? 'PROBES PASSED' : 'READINESS BLOCKED',
  checkedAt: new Date().toISOString(),
  ticker: policy.ticker,
  amount: policy.amount,
  probeWallet: process.env.ATLAS_QUOTE_PROBE_WALLET ? 'supplied' : 'random-unfunded',
  routes,
  simulationProbe,
  approvalProbe,
  transactionsBroadcast: 0,
};
console.log(JSON.stringify(evidence));

if (results.some((result) => result.status === 'fulfilled' && result.value.length > 0)) {
  await mkdir('docs/devex', { recursive: true });
  await writeFile(
    'docs/devex/authenticated-quote-evidence.json',
    JSON.stringify(evidence, null, 2),
  );
} else {
  process.exitCode = 1;
}
if (evidence.status === 'READINESS BLOCKED') process.exitCode = 1;
