import { mkdir, writeFile } from 'node:fs/promises';
import { z } from 'zod';
const url = new URL(
  '/api/system/status',
  process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
);
const response = await fetch(url);
if (!response.ok) throw new Error('Start ATLAS before exporting runtime evidence');
const state = z
  .object({
    observations: z.array(z.record(z.string(), z.unknown())),
    telemetry: z.array(z.unknown()),
    integrations: z.array(z.unknown()),
  })
  .parse(await response.json());
await mkdir('docs/devex', { recursive: true });
await Promise.all([
  writeFile(
    'docs/devex/api-observations.jsonl',
    state.observations.map((e) => JSON.stringify(e)).join('\n'),
  ),
  writeFile(
    'docs/devex/errors.jsonl',
    state.observations
      .filter((e) => !e.success)
      .map((e) => JSON.stringify(e))
      .join('\n'),
  ),
  writeFile('docs/devex/latency-summary.json', JSON.stringify(state.telemetry, null, 2)),
  writeFile(
    'docs/devex/integration-status.json',
    JSON.stringify(
      { exportedAt: new Date().toISOString(), integrations: state.integrations },
      null,
      2,
    ),
  ),
]);
console.log(
  `Exported ${state.observations.length} actual recent observations. No opinions generated.`,
);
