import { mkdir, writeFile } from 'node:fs/promises';
import { BinanceClient } from '../packages/binance-web3/client';
import { balanceSchema } from '../packages/binance-web3/schemas';
import { address } from '../packages/core/domain';
import { safeMessage } from '../packages/core/http';
try {
  const wallet = address.parse(process.argv[2]);
  const rows = await new BinanceClient().call('Wallet', '/api/v1/dex/balance/all-token-balances-by-address', balanceSchema,
    { address: wallet, chains: '56', excludeRiskToken: 'true', page: '1', pageSize: '100' });
  const assets = rows.flatMap((r) => r.tokenAssets);
  if (assets.some((a) => a.binanceChainId !== '56' || a.address.toLowerCase() !== wallet.toLowerCase()))
    throw new Error('Wallet API returned an unexpected chain or owner.');
  const report = { checkedAt: new Date().toISOString(), integration: 'Binance Wallet API', result: 'READ VERIFIED', chainId: 56,
    assetCount: assets.length, notice: 'Public address and balances are intentionally omitted from saved evidence.', transactionsBroadcast: 0 };
  await mkdir('docs/devex', { recursive: true });
  await writeFile('docs/devex/wallet-read-evidence.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) { console.error(safeMessage(error)); process.exitCode = 1; }
