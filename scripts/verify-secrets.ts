import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean))];
async function bundleFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? bundleFiles(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]))).flat();
}
files.push(...await bundleFiles('apps/web/.next/static'));
const keys = ['BINANCE_WEB3_API_KEY', 'BINANCE_WEB3_API_SECRET', 'ALPACA_API_KEY_ID', 'ALPACA_API_SECRET_KEY', 'ATLAS_AGENT_TOKEN', 'ATLAS_REFERENCE_TOKEN', 'DATABASE_URL'];
const secrets = keys.flatMap((key) => process.env[key] && process.env[key]!.length >= 12 ? [{ type: key, value: process.env[key]! }] : []);
if (process.env.DATABASE_URL) { const password = decodeURIComponent(new URL(process.env.DATABASE_URL).password); if (password.length >= 12) secrets.push({ type: 'DATABASE_PASSWORD', value: password }); }
const findings: { file: string; type: string }[] = [];
for (const file of files) {
  if (/^\.env(\.|$)/.test(file) && file !== '.env.example') findings.push({ file, type: 'TRACKED_ENVIRONMENT_FILE' });
  const data = await readFile(file, 'utf8').catch(() => '');
  for (const secret of secrets) if (data.includes(secret.value)) findings.push({ file, type: secret.type });
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(data)) findings.push({ file, type: 'PRIVATE_KEY_BLOCK' });
}
console.log(JSON.stringify({ status: findings.length ? 'REVIEW REQUIRED' : 'PASS', filesScanned: files.length, findings, scope: 'Tracked/non-ignored files and built client assets; known configured secrets and private-key blocks. Not a guarantee against unknown secret formats.' }, null, 2));
process.exitCode = findings.length ? 1 : 0;
