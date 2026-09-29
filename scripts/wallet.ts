import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { AgenticWallet } from '../packages/execution/agentic-wallet';
import { evaluate } from '../packages/agent/service';
import { policySchema } from '../packages/core/domain';
import { prepareTransaction, verifyTransaction } from '../packages/execution';
import { claimExecution, saveReceipt } from '../packages/db';
const wallet = new AgenticWallet(),
  command = process.argv[2] ?? 'status';
if (command === 'status') console.log(JSON.stringify(await wallet.status(), null, 2));
else if (command === 'balance') console.log(JSON.stringify(await wallet.balances(), null, 2));
else if (command === 'settings') console.log(JSON.stringify(await wallet.settings(), null, 2));
else if (command === 'trade') {
  if (!process.argv[3]) throw new Error('Usage: pnpm wallet trade policy.json');
  if (!process.env.DATABASE_URL)
    throw new Error('Live Agentic Wallet requires PostgreSQL for durable receipts.');
  const policy = policySchema.parse(JSON.parse(await readFile(process.argv[3], 'utf8')));
  if (policy.executionMode !== 'live')
    throw new Error('Use a live-mode policy file for the interactive trade flow.');
  if ((await wallet.status()).status !== 'CONNECTED')
    throw new Error('Sign in using the official baw auth flow first.');
  const address = (await wallet.addresses()).addresses.find(
    (a) => a.binanceChainId === '56',
  )?.address;
  if (!address) throw new Error('Agentic Wallet did not return a BSC address.');
  const owner = 'baw:' + address.toLowerCase();
  const receipt = await evaluate({ policy, wallet: address }, owner);
  // prepareTransaction enforces all route checks; this first call only validates, never signs.
  const transaction = await prepareTransaction(receipt, address, true);
  const preview = await wallet.preview(transaction);
  console.log(JSON.stringify({ receipt, preview }, null, 2));
  if (
    preview.simulationResult.simulationCode !== '000000000' ||
    preview.simulationResult.simulationErrorDetail !== null ||
    preview.risks.riskDetails.length ||
    preview.risks.riskBehaviors.length ||
    Object.keys(preview.risks.addresses).length
  )
    throw new Error('Wallet preview requires risk review; ATLAS refuses automatic signing.');
  const rl = createInterface({ input: stdin, output: stdout });
  const confirmation = await rl.question(
    'Mainnet moves real assets. Review the parsed transaction and all evidence above. Type EXECUTE to submit, anything else cancels: ',
  );
  rl.close();
  if (confirmation !== 'EXECUTE') throw new Error('Cancelled. No funds moved.');
  const selected = receipt.candidates.find((e) => e.id === receipt.selectedRouteId)!;
  if (Date.now() >= Math.min(preview.expiresAt, Date.parse(selected.quote!.expiresAt)) - 3000)
    throw new Error('Preview or quote expired. Run again and review the new evidence.');
  await prepareTransaction(receipt, address, true);
  await claimExecution(
    owner,
    receipt.intent.id,
    transaction,
    receipt.id,
    selected.quote!.expiresAt,
  );
  const submitted = await wallet.execute(preview.requestId);
  console.log(JSON.stringify(submitted, null, 2));
  if (submitted.txHash) {
    const verified = await verifyTransaction(
      receipt,
      transaction,
      submitted.txHash as `0x${string}`,
    );
    await saveReceipt(owner, verified);
    console.log(JSON.stringify(verified, null, 2));
  }
} else throw new Error('Supported commands: status, balance, settings, trade policy.json');
