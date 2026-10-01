import { runWork } from '../packages/agent/studio-hook';
import { safeMessage } from '../packages/core/http';
if (!process.env.ATLAS_REPORT_URL || !process.env.ATLAS_AGENT_TOKEN) {
  console.log(JSON.stringify({ status: 'READY FOR USER ACTION', missing: ['ATLAS_REPORT_URL', 'ATLAS_AGENT_TOKEN'].filter((name) => !process.env[name]),
    action: 'Configure the deployed HTTPS report endpoint and server-side bearer, then rerun pnpm verify:studio.', deploymentVerified: false, transactionsBroadcast: 0 }));
  process.exitCode = 1;
} else try {
  const result = JSON.parse(await runWork(JSON.stringify({ ticker: 'NVDA', amount: '10', executionMode: 'quote' }), { sessionId: crypto.randomUUID() }));
  console.log(JSON.stringify({ status: 'REPORT HOOK VERIFIED', receiptId: result.id, decision: result.decision,
    dataMode: result.dataMode, studioDeploymentVerified: false, identityVerified: false, transactionsBroadcast: 0 }));
} catch (error) { console.error(safeMessage(error)); process.exitCode = 1; }
