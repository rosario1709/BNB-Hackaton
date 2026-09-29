import { createPublicClient, http, erc20Abi, decodeEventLog, type Address, type Hex } from 'viem';
import { bsc } from 'viem/chains';
import Decimal from 'decimal.js';
import { address, type Receipt, type Transaction } from '../core/domain';
import { checkRoute } from '../core/risk';
import { config } from '../core/config';
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
  const spend =
    receipt.intent.side === 'buy'
      ? new Decimal(receipt.intent.amount).mul(e.quote.inputPriceUsd)
      : new Decimal(receipt.intent.amount)
          .mul(e.representation.sharesPerToken)
          .mul(e.market.referencePrice!);
  if (spend.gt(maxTrade)) throw new Error(`Mainnet trade limit is ${maxTrade} USD.`);
  return e;
}
export function rpc() {
  return createPublicClient({
    chain: bsc,
    transport: http(process.env.BSC_RPC_URL ?? 'https://bsc-dataseed.bnbchain.org', {
      timeout: 10000,
      retryCount: 1,
    }),
  });
}
export async function prepareTransaction(
  receipt: Receipt,
  wallet: string,
  confirmed: boolean,
): Promise<Transaction> {
  const cfg = config(),
    e = executionGate(receipt, confirmed, cfg.liveEnabled, cfg.maxTrade),
    tx = e.simulation!.transaction!,
    q = e.quote!;
  address.parse(wallet);
  if (tx.from.toLowerCase() !== wallet.toLowerCase())
    throw new Error('Wallet does not match simulation.');
  const allowed = (process.env.ATLAS_ALLOWED_ROUTERS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase());
  if (!allowed.includes(tx.to.toLowerCase()))
    throw new Error('Transaction target is not on the operator-verified router allowlist.');
  const client = rpc();
  if ((await client.getChainId()) !== 56) throw new Error('RPC is not BSC mainnet.');
  const [balance, native, gas, gasPrice] = await Promise.all([
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
  ]);
  if (balance < BigInt(q.amountInRaw)) throw new Error('Insufficient input token balance.');
  if (native < (gas * gasPrice * 12n) / 10n + BigInt(tx.value))
    throw new Error('Insufficient BNB for gas plus a 20% margin.');
  if (Date.now() >= Date.parse(q.expiresAt) - 3000)
    throw new Error('Quote is too close to expiry. Re-evaluate before signing.');
  return tx;
}
export async function verifyTransaction(
  receipt: Receipt,
  expected: Transaction,
  hash: Hex,
): Promise<Receipt> {
  const client = rpc();
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
  } catch {
    return {
      ...receipt,
      id: crypto.randomUUID(),
      status: 'pending',
      executed: false,
      verification: 'pending',
      transactionHash: hash,
      blockExplorerUrl: `https://bscscan.com/tx/${hash}`,
      reason: 'Submitted transaction found on BSC; confirmation is pending.',
      createdAt: new Date().toISOString(),
    };
  }
  const e = receipt.candidates.find((c) => c.id === receipt.selectedRouteId)!,
    q = e.quote!;
  let received = 0n;
  let spent = 0n;
  for (const log of mined.logs) {
    try {
      const decoded = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
      if (decoded.eventName === 'Transfer') {
        const incoming = decoded.args.to.toLowerCase() === expected.from.toLowerCase();
        const outgoing = decoded.args.from.toLowerCase() === expected.from.toLowerCase();
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
  const minimum = (BigInt(q.amountOutRaw) * BigInt(10000 - q.slippageBps)) / 10000n;
  const matches = confirmed && spent === BigInt(q.amountInRaw) && received >= minimum;
  const actualAmountOut = new Decimal(received.toString())
    .div(new Decimal(10).pow(q.outputDecimals))
    .toFixed();
  return {
    ...receipt,
    id: crypto.randomUUID(),
    executed: confirmed,
    status: confirmed ? 'confirmed' : 'reverted',
    verification: matches ? 'passed' : 'mismatch',
    actualAmountOut,
    transactionHash: hash,
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
