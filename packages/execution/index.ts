import { erc20Abi, decodeEventLog, type Address, type Hex } from 'viem';
import Decimal from 'decimal.js';
import { address, type Evaluation, type Receipt, type Transaction } from '../core/domain';
import { checkRoute } from '../core/risk';
import { config } from '../core/config';
import { rpc, requireBsc, requireAllowed, requireCode, verifyQuoteTokens, type ChainClient } from './chain';
import { resolveSpender } from './spender';
import { assertNoExecutionHold, holdExecution } from '../db';
export { rpc } from './chain';
export function tradeLimitAmount(receipt: Receipt, route: Evaluation): Decimal {
  return receipt.intent.side === 'buy'
    ? new Decimal(receipt.intent.amount)
    : new Decimal(receipt.intent.amount)
        .mul(route.representation.sharesPerToken)
        .mul(route.market.referencePrice!);
}
export function executionGate(
  receipt: Receipt,
  confirmed: boolean,
  enabled: boolean,
  maxTrade: string,
) {
  if (!enabled) throw new Error('Live trading is disabled.');
  if (!confirmed) throw new Error('Explicit mainnet confirmation is required.');
  if (receipt.dataMode !== 'live' || receipt.intent.executionMode !== 'live')
    throw new Error('Quote and simulation modes cannot broadcast.');
  if (receipt.decision !== 'approved') throw new Error('Rejected policy cannot execute.');
  const e = receipt.candidates.find((c) => c.id === receipt.selectedRouteId);
  if (
    !e?.eligible ||
    !e.quote ||
    e.simulation?.success !== true ||
    e.simulation.kind !== 'binance' ||
    !e.simulation.transaction
  )
    throw new Error('A verified simulation of the exact transaction is required.');
  if (checkRoute(receipt.intent, e).some((c) => c.status === 'fail'))
    throw new Error('Policy evidence expired or failed. Re-evaluate.');
  const spend = tradeLimitAmount(receipt, e);
  if (spend.gt(maxTrade)) throw new Error(`Mainnet trade limit is ${maxTrade} USD.`);
  return e;
}
export async function prepareTransaction(
  receipt: Receipt,
  wallet: string,
  confirmed: boolean,
  client: ChainClient = rpc(),
): Promise<Transaction> {
  if (process.env.ATLAS_DEMO_MODE !== 'false' || !config().credentials)
    throw new Error('Set ATLAS_DEMO_MODE=false and both Binance Web3 credentials before live preparation.');
  const cfg = config(),
    e = executionGate(receipt, confirmed, cfg.liveEnabled, cfg.maxTrade),
    tx = e.simulation!.transaction!,
    q = e.quote!;
  address.parse(wallet);
  await assertNoExecutionHold(wallet);
  if (tx.from.toLowerCase() !== wallet.toLowerCase())
    throw new Error('Wallet does not match simulation.');
  if (tx.value !== '0' || tx.data === '0x') throw new Error('SWAP must have calldata and zero native value.');
  requireAllowed(tx.to, 'Router');
  await requireBsc(client);
  await verifyQuoteTokens(client, receipt.intent, e, wallet);
  const spender = await resolveSpender(q);
  requireAllowed(spender, 'Spender');
  await requireCode(client, spender, 'Spender');
  const allowance = await client.readContract({ address: q.inputToken as Address, abi: erc20Abi,
    functionName: 'allowance', args: [wallet as Address, spender as Address] });
  if (allowance < BigInt(q.amountInRaw)) throw new Error('INSUFFICIENT_ALLOWANCE: confirm exact approval, then obtain a fresh quote and simulation.');
  const [balance, native, gas, gasPrice, routerCode] = await Promise.all([
    client.readContract({
      address: q.inputToken as Address,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [wallet as Address],
    }),
    client.getBalance({ address: wallet as Address }),
    client.estimateGas({
      account: wallet as Address,
      to: tx.to as Address,
      data: tx.data as Hex,
      value: BigInt(tx.value),
    }),
    client.getGasPrice(),
    client.getBytecode({ address: tx.to as Address }),
  ]);
  if (!routerCode || routerCode === '0x')
    throw new Error('Approved router has no contract code on BSC mainnet.');
  if (balance < BigInt(q.amountInRaw)) throw new Error('Insufficient input token balance.');
  if (native < (gas * gasPrice * 12n + 9n) / 10n + BigInt(tx.value))
    throw new Error('Insufficient BNB for gas plus a 20% margin.');
  if (Date.now() >= Date.parse(q.expiresAt) - 3000)
    throw new Error('Quote is too close to expiry. Re-evaluate before signing.');
  return tx;
}
export async function verifyTransaction(
  receipt: Receipt,
  expected: Transaction,
  hash: Hex,
  client: ChainClient = rpc(),
): Promise<Receipt> {
  if ((await client.getChainId()) !== 56) throw new Error('RPC is not BSC mainnet.');
  const tx = await client.getTransaction({ hash });
  if (
    tx.from.toLowerCase() !== expected.from.toLowerCase() ||
    tx.to?.toLowerCase() !== expected.to.toLowerCase() ||
    tx.input.toLowerCase() !== expected.data.toLowerCase() ||
    tx.value !== BigInt(expected.value)
  )
    throw new Error('Transaction does not match the prepared execution.');
  let mined;
  try {
    mined = await client.getTransactionReceipt({ hash });
  } catch (error) {
    if (!(error instanceof Error) || error.name !== 'TransactionReceiptNotFoundError')
      throw new Error('BSC receipt lookup failed. Retry verification; do not submit another trade.');
    return {
      ...receipt,
      id: crypto.randomUUID(),
      status: 'pending',
      executed: false,
      verification: 'pending',
      transactionHash: hash,
      executionTransaction: expected,
      blockExplorerUrl: `https://bscscan.com/tx/${hash}`,
      reason: 'Submitted transaction found on BSC; confirmation is pending.',
      createdAt: new Date().toISOString(),
    };
  }
  const e = receipt.candidates.find((c) => c.id === receipt.selectedRouteId)!,
    q = e.quote!;
  let received = 0n;
  let spent = 0n;
  const transfers: NonNullable<Receipt['chainEvidence']>['transfers'] = [];
  for (const log of mined.logs) {
    try {
      const decoded = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
      if (decoded.eventName === 'Transfer') {
        const incoming = decoded.args.to.toLowerCase() === expected.from.toLowerCase();
        const outgoing = decoded.args.from.toLowerCase() === expected.from.toLowerCase();
        if ((incoming || outgoing) && [q.inputToken.toLowerCase(), q.outputToken.toLowerCase()].includes(log.address.toLowerCase()))
          transfers.push({ token: log.address, from: decoded.args.from, to: decoded.args.to, amountRaw: decoded.args.value.toString(), logIndex: log.logIndex });
        if (log.address.toLowerCase() === q.outputToken.toLowerCase()) {
          if (incoming) received += decoded.args.value;
          if (outgoing) received -= decoded.args.value;
        }
        if (log.address.toLowerCase() === q.inputToken.toLowerCase()) {
          if (outgoing) spent += decoded.args.value;
          if (incoming) spent -= decoded.args.value;
        }
      }
    } catch {
      /* Other event ABI */
    }
  }
  const confirmed = mined.status === 'success';
  const policyMinimum = (BigInt(q.amountOutRaw) * BigInt(10000 - q.slippageBps)) / 10000n;
  const builtMinimum = BigInt(q.minReceiveAmountRaw ?? '0');
  const minimum = builtMinimum > policyMinimum ? builtMinimum : policyMinimum;
  const matches = confirmed && spent === BigInt(q.amountInRaw) && received >= minimum;
  const actualAmountOut = new Decimal(received.toString())
    .div(new Decimal(10).pow(q.outputDecimals))
    .toFixed();
  if (!matches) await holdExecution(expected.from, confirmed ? 'TOKEN_FLOW_MISMATCH' : 'TRANSACTION_REVERTED', hash);
  return {
    ...receipt,
    id: crypto.randomUUID(),
    executed: confirmed,
    status: confirmed ? 'confirmed' : 'reverted',
    verification: matches ? 'passed' : 'mismatch',
    actualAmountOut,
    transactionHash: hash,
    executionTransaction: expected,
    chainEvidence: { chainId: 56, blockNumber: mined.blockNumber.toString(), blockHash: mined.blockHash,
      inputDebitRaw: spent.toString(), outputCreditRaw: received.toString(), minimumOutputRaw: minimum.toString(), transfers },
    blockExplorerUrl: `https://bscscan.com/tx/${hash}`,
    reason: confirmed
      ? matches
        ? `Confirmed on BSC. Verified net receipt of ${actualAmountOut} output tokens and exact input debit from Transfer logs.`
        : `Transaction succeeded on BSC, but token flows did not match the approved quote. Review required. Net output: ${actualAmountOut}.`
      : 'Transaction reverted on BSC. Gas may have been spent.',
    createdAt: new Date().toISOString(),
    timeline: [
      ...receipt.timeline,
      {
        label: confirmed ? 'Confirmed on BSC' : 'Reverted on BSC',
        at: new Date().toISOString(),
        durationMs: 0,
      },
    ],
  };
}
