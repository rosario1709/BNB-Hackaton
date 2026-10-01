import { mkdir, writeFile } from 'node:fs/promises';
import { LiveAdapter } from '../packages/market/live';
import { ApiError } from '../packages/binance-web3/client';
import { observations } from '../packages/telemetry';

if (!process.env.BINANCE_WEB3_API_KEY || !process.env.BINANCE_WEB3_API_SECRET)
  throw new Error('Configure both Binance Web3 API credentials before verification.');

const ticker = process.argv[2] ?? 'NVDA';
const adapter = new LiveAdapter();
const representations = await adapter.discover(ticker);
const marketResults = await Promise.allSettled(
  representations.map((representation) => adapter.market(representation)),
);

const markets = marketResults.map((result, index) => ({
  symbol: representations[index].symbol,
  provider: representations[index].provider,
  status: representations[index].status,
  tradable: representations[index].tradable,
  ...(result.status === 'fulfilled'
    ? {
        result: 'verified',
        hasOnchainPrice: !!result.value.onchainPrice,
        hasSourceTimestamp: !!result.value.onchainTimestamp,
        hasIndependentReference: !!result.value.referenceTimestamp,
      }
    : {
        result: 'failed',
        code: result.reason instanceof ApiError ? result.reason.code : 'MARKET_ERROR',
      }),
}));

const evidence = {
  checkedAt: new Date().toISOString(),
  ticker,
  representations: representations.length,
  markets,
  operations: observations.map(({ module, operation, httpStatus, success, errorCode }) => ({
    module,
    operation,
    httpStatus,
    success,
    errorCode,
  })),
  transactionsBroadcast: 0,
};

console.log(JSON.stringify(evidence));

if (!representations.length || markets.every((market) => market.result === 'failed')) {
  process.exitCode = 1;
} else {
  await mkdir('docs/devex', { recursive: true });
  await writeFile('docs/devex/authenticated-read-evidence.json', JSON.stringify(evidence, null, 2));
}
