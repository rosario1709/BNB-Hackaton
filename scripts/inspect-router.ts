import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { inspectContract } from '../packages/execution/inspect';
import { safeMessage } from '../packages/core/http';
try {
  let source: unknown;
  try { source = JSON.parse(await readFile('docs/devex/authenticated-quote-evidence.json', 'utf8')); }
  catch { source = { notice: 'No saved signed quote evidence. Run pnpm verify:quote first.' }; }
  if (!process.argv[2]) throw new Error('Usage: pnpm inspect:router <ROUTER> [SPENDER]');
  const contracts = await Promise.all([...new Set(process.argv.slice(2, 4))].map((value) => inspectContract(value)));
  const report = { checkedAt: new Date().toISOString(), source: 'BSC JSON-RPC plus saved Binance signed quote evidence (compare timestamps)', quoteEvidence: source,
    contracts, status: 'OPERATOR REVIEW REQUIRED', allowlistChanged: false, transactionsBroadcast: 0 };
  await mkdir('docs/devex', { recursive: true });
  await writeFile('docs/devex/router-inspection.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) { console.error(safeMessage(error)); process.exitCode = 1; }
