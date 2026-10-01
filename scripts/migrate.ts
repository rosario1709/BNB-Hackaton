import postgres from 'postgres';
import { readFile, readdir } from 'node:fs/promises';
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL before migrating');
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  await sql.begin(async (tx) => {
    for (const file of (await readdir('packages/db/migrations')).filter((v) => /^\d+.*\.sql$/.test(v)).sort())
      await tx.unsafe(await readFile(`packages/db/migrations/${file}`, 'utf8'));
  });
  console.log('All idempotent migrations applied.');
} finally {
  await sql.end();
}
