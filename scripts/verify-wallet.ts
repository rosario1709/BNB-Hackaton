import { walletReadiness } from '../packages/execution/readiness';
try {
  const result = await walletReadiness(process.argv[2], process.argv[3] ?? '10', process.argv[4]);
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'READY') process.exitCode = 1;
} catch {
  console.log(JSON.stringify({ status: 'NOT READY', reasons: ['CONFIGURATION_OR_RPC_ERROR'],
    action: 'Check public address, ATLAS_USDT_ADDRESS, ATLAS_USDT_DECIMALS and BSC_RPC_URL. Usage: pnpm verify:wallet <PUBLIC_ADDRESS> 10 [SPENDER]', transactionsBroadcast: 0 }));
  process.exitCode = 1;
}
