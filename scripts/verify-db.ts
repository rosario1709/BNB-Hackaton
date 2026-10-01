import postgres from 'postgres';
import { readFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { safeMessage } from '../packages/core/http';

async function child() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  // Apply twice to the disposable database: migration idempotency is part of this check.
  for (let i = 0; i < 2; i++) await sql.begin(async (tx) => {
    for (const file of (await readdir('packages/db/migrations')).filter((v) => /^\d+.*\.sql$/.test(v)).sort())
      await tx.unsafe(await readFile(`packages/db/migrations/${file}`, 'utf8'));
  });
  const { evaluateRoutes } = await import('../packages/core/router');
  const { policySchema } = await import('../packages/core/domain');
  const { DemoAdapter } = await import('../packages/market/demo');
  const db = await import('../packages/db');
  const receipt = await evaluateRoutes({ ...policySchema.parse({ ticker: 'NVDA', amount: '10' }), id: crypto.randomUUID(), createdAt: new Date().toISOString() }, new DemoAdapter());
  const transaction = { from: '0x1111111111111111111111111111111111111111', to: '0x2222222222222222222222222222222222222222', value: '0', data: '0x1234' };
  await db.saveReceipt('owner-a', receipt);
  assert.equal((await db.getReceipt('owner-a', receipt.id))?.id, receipt.id);
  assert.equal(await db.getReceipt('owner-b', receipt.id), undefined);
  const results = await Promise.allSettled([1, 2].map(() => db.claimExecution('owner-a', receipt.intent.id, transaction, receipt.id, new Date().toISOString())));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  await assert.rejects(db.claimExecution('owner-a', receipt.intent.id, transaction, receipt.id, new Date().toISOString()));
  assert.equal(await db.getExecution('owner-b', receipt.intent.id), undefined);
  const evidence = { id: crypto.randomUUID(), status: 'prepared' as const, token: transaction.to, spender: transaction.to, wallet: transaction.from, amountRaw: '10', transaction };
  await db.saveApproval('owner-a', evidence, receipt.intent, receipt.id);
  assert.equal(await db.getApproval('owner-b', evidence.id), undefined);
  await assert.rejects(db.updateApproval('owner-b', { ...evidence, status: 'confirmed' }));
  await db.assertNoExecutionHold(transaction.from);
  await db.holdExecution(transaction.from, 'TEST_MISMATCH', `0x${'a'.repeat(64)}`);
  await assert.rejects(db.assertNoExecutionHold(transaction.from));
  const clone = { ...receipt, id: crypto.randomUUID(), reason: 'Second immutable snapshot' };
  await db.saveReceipt('owner-a', clone);
  assert.notEqual((await db.getReceipt('owner-a', receipt.id))?.reason, clone.reason);
  await sql.end();
  console.log(JSON.stringify({ status: 'PASS', checks: ['migrations applied twice', 'receipt owner isolation', 'concurrent execution claim', 'duplicate/replay rejection', 'execution owner isolation', 'approval owner isolation', 'persistent review hold', 'immutable snapshots'], realTrades: 0 }));
}
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL before the PostgreSQL integration check.');
  if (process.argv.includes('--child')) { await child(); process.exit(0); }
  const name = `atlas_verify_${crypto.randomUUID().replaceAll('-', '')}`;
  const admin = postgres(process.env.DATABASE_URL, { max: 1 });
  let created = false;
  try {
    await admin.unsafe(`CREATE DATABASE "${name}"`); created = true;
    const url = new URL(process.env.DATABASE_URL); url.pathname = `/${name}`;
    const result = await promisify(execFile)(process.execPath, ['--import', 'tsx', 'scripts/verify-db.ts', '--child'], {
      env: { ...process.env, DATABASE_URL: url.toString() }, windowsHide: true, timeout: 60000,
    });
    console.log(result.stdout.trim());
  } finally {
    // Only the unique database created by this invocation is removed; never the configured database.
    if (created && /^atlas_verify_[a-f0-9]{32}$/.test(name)) await admin.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
  }
}
main().catch((error) => { console.error(safeMessage(error, 'Database verification failed; check local PostgreSQL availability and permission to create a disposable database.')); process.exit(1); });
