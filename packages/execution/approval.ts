import { encodeFunctionData, erc20Abi, type Address, type Hex } from 'viem';
import { z } from 'zod';
import { BinanceClient } from '../binance-web3/client';
import { approvalSchema } from '../binance-web3/schemas';
import { address, type Quote, type Receipt, type Transaction, type ApprovalEvidence } from '../core/domain';
import { checkRoute } from '../core/risk';
import { rpc, tradeLimitAmount } from './index';
import { requireAllowed, requireBsc, verifyQuoteTokens, type ChainClient } from './chain';
import { assertNoExecutionHold } from '../db';
import { resolveSpender } from './spender';

export function approvalTransaction(
  quote: Quote,
  wallet: string,
  rows: z.infer<typeof approvalSchema>,
): Transaction {
  const spender = address.parse(quote.approveTarget);
  if (quote.executionMode !== 'SWAP' || rows.length !== 1)
    throw new Error('A single SWAP approval route is required.');
  const expectedData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [spender as Address, BigInt(quote.amountInRaw)],
  });
  if (
    rows[0].dexContractAddress.toLowerCase() !== spender.toLowerCase() ||
    rows[0].data.toLowerCase() !== expectedData.toLowerCase()
  )
    throw new Error('Approval spender or amount differs from the signed quote.');
  return {
    from: address.parse(wallet),
    to: address.parse(quote.inputToken),
    value: '0',
    data: expectedData,
  };
}

export async function prepareTokenApproval(
  receipt: Receipt,
  wallet: string,
  maxTradeUsd: string,
  chain: ChainClient = rpc(),
): Promise<
  | { status: 'already-approved'; token: string; spender?: string; amount: string }
  | {
      status: 'required';
      transaction: Transaction;
      token: string;
      spender: string;
      amount: string;
      displayAmount: string;
      denomination: string;
      routeSymbol: string;
    }
> {
  if (receipt.dataMode !== 'live' || receipt.intent.executionMode !== 'quote')
    throw new Error('A fresh live-data quote is required for approval.');
  if (receipt.decision !== 'approved') throw new Error('Policy checks must pass before approval.');
  const selected = receipt.candidates.find((candidate) => candidate.id === receipt.selectedRouteId);
  const quote = selected?.quote;
  if (!selected || !quote || !selected.eligible || quote.executionMode !== 'SWAP')
    throw new Error('No eligible SWAP route is available for approval.');
  if (checkRoute(receipt.intent, selected).some((check) => check.status === 'fail'))
    throw new Error('Quote or policy evidence expired. Re-evaluate.');
  const spend = tradeLimitAmount(receipt, selected);
  if (spend.gt(maxTradeUsd)) throw new Error(`Mainnet trade limit is ${maxTradeUsd} USD.`);
  const owner = address.parse(wallet);
  await assertNoExecutionHold(owner);
  const token = address.parse(quote.inputToken);
  const spender = await resolveSpender(quote);
  requireAllowed(spender, 'Approval spender');
  await requireBsc(chain);
  await verifyQuoteTokens(chain, receipt.intent, selected, owner);
  const [balance, native, allowance, code] = await Promise.all([
    chain.readContract({
      address: token as Address,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [owner as Address],
    }),
    chain.getBalance({ address: owner as Address }),
    chain.readContract({
      address: token as Address,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [owner as Address, spender as Address],
    }),
    chain.getBytecode({ address: spender as Address }),
  ]);
  if (!code || code === '0x') throw new Error('Approval spender has no contract code on BSC.');
  if (allowance >= BigInt(quote.amountInRaw))
    return { status: 'already-approved', token, spender, amount: quote.amountInRaw };
  if (balance < BigInt(quote.amountInRaw)) throw new Error('Insufficient input token balance.');
  if (native === 0n) throw new Error('BNB is required for approval gas.');

  const rows = await new BinanceClient().call(
    'Trading',
    '/api/v1/dex/aggregator/approve-transaction',
    approvalSchema,
    {
      binanceChainId: '56',
      tokenContractAddress: token,
      approveAmount: quote.amountInRaw,
      vendor: quote.vendor,
    },
  );
  const transaction = approvalTransaction({ ...quote, approveTarget: spender }, owner, rows);
  const [gas, gasPrice] = await Promise.all([
    chain.estimateGas({
      account: owner as Address,
      to: token as Address,
      data: transaction.data as Hex,
    }),
    chain.getGasPrice(),
  ]);
  if (native < (gas * gasPrice * 12n + 9n) / 10n)
    throw new Error('Insufficient BNB for approval gas plus a 20% margin.');
  if (checkRoute(receipt.intent, selected).some((check) => check.status === 'fail'))
    throw new Error('Quote or reference expired during approval preparation. Re-evaluate.');
  return {
    status: 'required',
    transaction,
    token,
    spender,
    amount: quote.amountInRaw,
    displayAmount: receipt.intent.amount,
    denomination: receipt.intent.denomination,
    routeSymbol: selected.representation.symbol,
  };
}

export async function verifyTokenApproval(evidence: ApprovalEvidence, hash: Hex, client: ChainClient = rpc()): Promise<ApprovalEvidence> {
  await requireBsc(client);
  const tx = await client.getTransaction({ hash }), expected = evidence.transaction;
  if (tx.from.toLowerCase() !== expected.from.toLowerCase() || tx.to?.toLowerCase() !== expected.to.toLowerCase() ||
    tx.value !== BigInt(expected.value) || tx.input.toLowerCase() !== expected.data.toLowerCase())
    throw new Error('Approval transaction does not match the prepared wallet, token, spender or amount.');
  let mined;
  try { mined = await client.getTransactionReceipt({ hash }); }
  catch (error) {
    if (!(error instanceof Error) || error.name !== 'TransactionReceiptNotFoundError') throw new Error('Approval RPC lookup failed. Retry verification.');
    return { ...evidence, status: 'pending', transactionHash: hash };
  }
  const base = { ...evidence, transactionHash: hash, blockNumber: mined.blockNumber.toString(), verifiedAt: new Date().toISOString() };
  if (mined.status !== 'success') return { ...base, status: 'reverted' };
  const allowance = await client.readContract({ address: evidence.token as Address, abi: erc20Abi,
    functionName: 'allowance', args: [evidence.wallet as Address, evidence.spender as Address], blockNumber: mined.blockNumber });
  return { ...base, status: allowance === BigInt(evidence.amountRaw) ? 'confirmed' : 'mismatch', allowanceRaw: allowance.toString() };
}
