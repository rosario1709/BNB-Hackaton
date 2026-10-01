import { productionReadiness } from '../packages/core/readiness';
import { rpc, requireBsc, configuredUsdt, verifyToken } from '../packages/execution/chain';
import { databaseHealth } from '../packages/db';
const report = productionReadiness(process.env, process.argv.includes('--demo') ? 'demo' : 'live');
try { await requireBsc(rpc()); } catch { report.issues.push('BSC_RPC_UNAVAILABLE_OR_INVALID_CHAIN'); }
if (report.profile === 'live') try { const token = configuredUsdt(); await verifyToken(rpc(), token.address, token.decimals); } catch { report.issues.push('USDT_ONCHAIN_VALIDATION_FAILED'); }
if (process.env.DATABASE_URL) try { await databaseHealth(); } catch { report.issues.push('DATABASE_UNAVAILABLE_OR_MIGRATION_MISSING'); }
report.status = report.issues.length ? 'NOT READY' : 'CONFIGURATION READY';
console.log(JSON.stringify({ ...report, checkedAt: new Date().toISOString(), transactionsBroadcast: 0 }, null, 2));
process.exit(report.issues.length ? 1 : 0);
