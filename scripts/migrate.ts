import postgres from 'postgres';
import { readFile } from 'node:fs/promises';
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL before migrating');
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  await sql.begin(async (tx) => {
    await tx.unsafe(await readFile('packages/db/migrations/0001_initial.sql', 'utf8'));
  });
  console.log('Migration 0001 applied');
} finally {
  await sql.end();
}
