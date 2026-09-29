import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, desc } from 'drizzle-orm';
import * as tables from './schema';
import type { Receipt, Transaction } from '../core/domain';
import { observations } from '../telemetry';
const shared = globalThis as typeof globalThis & {
  atlasReceipts?: Map<string, { owner: string; receipt: Receipt }>;
  atlasDb?: ReturnType<typeof makeDb>;
};
const memory = (shared.atlasReceipts ??= new Map());
function makeDb() {
  return drizzle(postgres(process.env.DATABASE_URL!, { max: 5, prepare: false }), {
    casing: 'snake_case',
  });
}
function db() {
  return (shared.atlasDb ??= makeDb());
}
export async function saveReceipt(owner: string, receipt: Receipt) {
  if (!process.env.DATABASE_URL) {
    memory.set(receipt.id, { owner, receipt: structuredClone(receipt) });
    if (memory.size > 500) memory.delete(memory.keys().next().value!);
    return;
  }
  await db().transaction(async (tx) => {
    await tx
      .insert(tables.intents)
      .values({ id: receipt.intent.id, owner, payload: receipt.intent })
      .onConflictDoNothing();
    for (const e of receipt.candidates) {
      await tx
        .insert(tables.representations)
        .values({ id: e.representation.tokenAddress, payload: e.representation })
        .onConflictDoUpdate({
          target: tables.representations.id,
          set: { payload: e.representation, updatedAt: new Date() },
        });
      await tx
        .insert(tables.evaluations)
        .values({ id: e.id, intentId: receipt.intent.id, payload: e })
        .onConflictDoNothing();
    }
    await tx.insert(tables.receipts).values({ id: receipt.id, owner, payload: receipt });
    if (observations.length)
      await tx
        .insert(tables.telemetry)
        .values(observations.map((e) => ({ id: e.id, payload: e })))
        .onConflictDoNothing();
  });
}
export async function listReceipts(owner: string): Promise<Receipt[]> {
  if (!process.env.DATABASE_URL)
    return [...memory.values()]
      .filter((v) => v.owner === owner)
      .map((v) => structuredClone(v.receipt))
      .reverse();
  return (
    await db()
      .select()
      .from(tables.receipts)
      .where(eq(tables.receipts.owner, owner))
      .orderBy(desc(tables.receipts.createdAt))
      .limit(100)
  ).map((r) => r.payload);
}
export async function getReceipt(owner: string, id: string): Promise<Receipt | undefined> {
  if (!process.env.DATABASE_URL) {
    const r = memory.get(id);
    return r?.owner === owner ? structuredClone(r.receipt) : undefined;
  }
  return (
    await db()
      .select()
      .from(tables.receipts)
      .where(and(eq(tables.receipts.id, id), eq(tables.receipts.owner, owner)))
      .limit(1)
  )[0]?.payload;
}
export async function claimExecution(
  owner: string,
  id: string,
  transaction: Transaction,
  receiptId: string,
  expiresAt: string,
) {
  if (!process.env.DATABASE_URL)
    throw new Error('Durable PostgreSQL persistence is required for live execution.');
  const rows = await db()
    .insert(tables.executions)
    .values({ id, owner, payload: { transaction, receiptId, expiresAt } })
    .onConflictDoNothing()
    .returning();
  if (!rows.length)
    throw new Error(
      'This execution has already been prepared. Inspect its transaction before starting a new intent.',
    );
}
export async function getExecution(owner: string, id: string) {
  if (!process.env.DATABASE_URL) return;
  return (
    await db()
      .select()
      .from(tables.executions)
      .where(and(eq(tables.executions.id, id), eq(tables.executions.owner, owner)))
      .limit(1)
  )[0]?.payload;
}
export async function databaseHealth() {
  if (!process.env.DATABASE_URL) return 'Temporary memory (resets on restart; local use only)';
  await db().select().from(tables.receipts).limit(1);
  return 'PostgreSQL connected';
}
