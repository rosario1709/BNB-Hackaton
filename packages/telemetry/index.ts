export interface Observation {
  id: string;
  correlationId: string;
  module: string;
  operation: string;
  startedAt: string;
  durationMs: number;
  httpStatus?: number;
  success: boolean;
  errorCode?: string;
  attempt: number;
}
const globalTelemetry = globalThis as typeof globalThis & { atlasTelemetry?: Observation[] };
export const observations = (globalTelemetry.atlasTelemetry ??= []);
export function observe(event: Observation) {
  observations.push(event);
  if (observations.length > 1000) observations.shift();
  console.info(JSON.stringify({ type: 'api_observation', ...event }));
}
export function summary() {
  return [...new Set(observations.map((e) => e.module))].map((module) => {
    const rows = observations.filter((e) => e.module === module);
    return {
      module,
      calls: rows.length,
      errors: rows.filter((e) => !e.success).length,
      meanMs: Math.round(rows.reduce((a, e) => a + e.durationMs, 0) / rows.length),
      firstSuccess: rows.find((e) => e.success)?.startedAt,
    };
  });
}
