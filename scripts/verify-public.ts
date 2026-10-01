import { mkdir, writeFile } from 'node:fs/promises';
import { PublicMarketAdapter } from '../packages/market/public';
import { observations, summary } from '../packages/telemetry';
const adapter = new PublicMarketAdapter();
const representations = await adapter.discover('NVDA');
const rows = [];
for (const representation of representations)
  rows.push({ representation, market: await adapter.market(representation) });
if (!rows.length)
  throw new Error('No NVDA BSC representations returned; no success claim written.');
await mkdir('docs/devex', { recursive: true });
await Promise.all([
  writeFile(
    'docs/devex/live-discovery-evidence.json',
    JSON.stringify(
      {
        retrievedAt: new Date().toISOString(),
        source: 'Official Binance Wallet Skill',
        response: { mode: 'live', rows },
      },
      null,
      2,
    ),
  ),
  writeFile(
    'docs/devex/api-observations.jsonl',
    observations.map((o) => JSON.stringify(o)).join('\n') + '\n',
  ),
  writeFile(
    'docs/devex/errors.jsonl',
    observations
      .filter((o) => !o.success)
      .map((o) => JSON.stringify(o))
      .join('\n'),
  ),
  writeFile('docs/devex/latency-summary.json', JSON.stringify(summary(), null, 2)),
  writeFile(
    'docs/devex/integration-status.json',
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        publicWalletSkill: 'WORKING',
        authenticatedWeb3:
          process.env.BINANCE_WEB3_API_KEY && process.env.BINANCE_WEB3_API_SECRET
            ? 'CONFIGURED; not checked by public verification'
            : 'NOT CONFIGURED',
        agenticWallet: process.env.ATLAS_BAW_EXECUTABLE
          ? 'CONFIGURED; authorization not verified'
          : 'NOT CONFIGURED',
        agentStudio: 'NOT DEPLOYED',
        transactionsBroadcast: 0,
      },
      null,
      2,
    ),
  ),
]);
console.log(
  JSON.stringify({
    verified: rows.map((r) => r.representation.symbol),
    calls: observations.length,
    mode: 'live',
    transactionsBroadcast: 0,
  }),
);
