import { rpc, requireBsc, configuredUsdt, verifyToken } from './chain';
import { observe } from '../telemetry';
export async function verifyNetwork() {
  const client = rpc();
  const checks: { module: string; success: boolean; checkedAt: string; detail: string }[] = [];
  for (const module of ['BSC RPC', 'USDT']) {
    const began = performance.now(), checkedAt = new Date().toISOString();
    let success = false;
    try {
      await requireBsc(client);
      if (module === 'USDT') { const token = configuredUsdt(); await verifyToken(client, token.address, token.decimals); }
      success = true;
    } catch { /* Report configuration/RPC failure without serializing transport errors. */ }
    const detail = module === 'BSC RPC' ? 'Chain ID 56' : 'Token bytecode and actual decimals match configuration';
    checks.push({ module, success, checkedAt, detail: success ? detail : `Check ${module === 'USDT' ? 'ATLAS_USDT_ADDRESS / ATLAS_USDT_DECIMALS and RPC' : 'BSC_RPC_URL'}` });
    observe({ id: crypto.randomUUID(), correlationId: 'network-preflight', module, operation: 'read-only-preflight', startedAt: checkedAt,
      durationMs: Math.round(performance.now() - began), success, attempt: 1, errorCode: success ? undefined : 'CONFIGURATION_OR_RPC_ERROR' });
  }
  return { checks, transactionsBroadcast: 0 };
}
