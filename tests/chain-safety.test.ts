import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, erc20Abi, maxUint256 } from 'viem';
import { evaluateRoutes } from '../packages/core/router';
import { policySchema, type ApprovalEvidence, type Receipt } from '../packages/core/domain';
import { DemoAdapter } from '../packages/market/demo';
import { prepareTransaction, verifyTransaction } from '../packages/execution';
import { approvalTransaction, prepareTokenApproval, verifyTokenApproval } from '../packages/execution/approval';
import { walletReadiness } from '../packages/execution/readiness';
import type { ChainClient } from '../packages/execution/chain';
import { holdExecution } from '../packages/db';
import { BinanceClient } from '../packages/binance-web3/client';

vi.mock('../packages/db', async (original) => ({ ...await original<typeof import('../packages/db')>(),
  assertNoExecutionHold: vi.fn().mockResolvedValue(undefined), holdExecution: vi.fn().mockResolvedValue(undefined) }));
const token = '0x1111111111111111111111111111111111111111';
const stock = '0x2222222222222222222222222222222222222222';
const wallet = '0x3333333333333333333333333333333333333333';
const router = '0x4444444444444444444444444444444444444444';
const hash = `0x${'a'.repeat(64)}` as const;
const transaction = { from: wallet, to: router, value: '0', data: '0x1234' };
let receipt: Receipt;
function chain() {
  return { getChainId: vi.fn().mockResolvedValue(56), getBlockNumber: vi.fn().mockResolvedValue(100n),
    getBytecode: vi.fn().mockResolvedValue('0x6000'), getBalance: vi.fn().mockResolvedValue(10n ** 18n),
    readContract: vi.fn(async ({ functionName }: { functionName: string }): Promise<number | bigint> => functionName === 'decimals' ? 18 : 20n * 10n ** 18n),
    estimateGas: vi.fn().mockResolvedValue(100000n), getGasPrice: vi.fn().mockResolvedValue(1000000000n),
    getTransaction: vi.fn().mockResolvedValue({ ...transaction, input: transaction.data, value: 0n }),
    getTransactionReceipt: vi.fn().mockResolvedValue({ status: 'success', blockNumber: 100n, blockHash: hash, logs: [] }),
  };
}
const asClient = (client: ReturnType<typeof chain>) => client as unknown as ChainClient;
const selected = () => receipt.candidates.find((c) => c.id === receipt.selectedRouteId)!;
beforeEach(async () => {
  vi.stubEnv('ATLAS_DEMO_MODE', 'false'); vi.stubEnv('ATLAS_LIVE_TRADING_ENABLED', 'true');
  vi.stubEnv('BINANCE_WEB3_API_KEY', 'unit-test'); vi.stubEnv('BINANCE_WEB3_API_SECRET', 'unit-test');
  vi.stubEnv('ATLAS_ALLOWED_ROUTERS', router); vi.stubEnv('ATLAS_USDT_ADDRESS', token); vi.stubEnv('ATLAS_USDT_DECIMALS', '18');
  receipt = await evaluateRoutes({ ...policySchema.parse({ ticker: 'NVDA', amount: '10', executionMode: 'live' }), id: crypto.randomUUID(), createdAt: new Date().toISOString() }, new DemoAdapter());
  receipt.dataMode = 'live';
  const e = selected(); e.representation.demo = false; e.representation.tokenAddress = stock;
  Object.assign(e.quote!, { inputToken: token, outputToken: stock, recipient: wallet, inputDecimals: 18, approveTarget: router });
  e.simulation = { success: true, kind: 'binance', transaction };
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe('Live preparation on-chain gates', () => {
  it('returns only the exact simulated transaction after all gates', async () =>
    expect(await prepareTransaction(receipt, wallet, true, asClient(chain()))).toEqual(transaction));
  it.each(['chain', 'wallet', 'router', 'allowlist', 'code', 'decimals', 'token', 'amount', 'recipient', 'balance', 'bnb', 'allowance', 'expired', 'simulation', 'unavailable', 'mode'])(
    'blocks %s mismatch', async (problem) => {
      const c = chain(), q = selected().quote!;
      if (problem === 'chain') c.getChainId.mockResolvedValue(1);
      if (problem === 'wallet') selected().simulation!.transaction = { ...transaction, from: stock };
      if (problem === 'router') selected().simulation!.transaction = { ...transaction, to: stock };
      if (problem === 'allowlist') vi.stubEnv('ATLAS_ALLOWED_ROUTERS', '');
      if (problem === 'code') c.getBytecode.mockResolvedValue('0x');
      if (problem === 'decimals') c.readContract.mockImplementation(async ({ functionName }) => functionName === 'decimals' ? 6 : 20n * 10n ** 18n);
      if (problem === 'token') q.inputToken = stock;
      if (problem === 'amount') q.amountInRaw = '1';
      if (problem === 'recipient') q.recipient = stock;
      if (problem === 'balance') c.readContract.mockImplementation(async ({ functionName }) => functionName === 'decimals' ? 18 : functionName === 'balanceOf' ? 1n : 20n * 10n ** 18n);
      if (problem === 'bnb') c.getBalance.mockResolvedValue(0n);
      if (problem === 'allowance') c.readContract.mockImplementation(async ({ functionName }) => functionName === 'decimals' ? 18 : functionName === 'allowance' ? 0n : 20n * 10n ** 18n);
      if (problem === 'expired') q.expiresAt = new Date(0).toISOString();
      if (problem === 'simulation') selected().simulation!.success = false;
      if (problem === 'unavailable') selected().simulation = { success: false, kind: 'unavailable' };
      if (problem === 'mode') vi.stubEnv('ATLAS_DEMO_MODE', 'auto');
      await expect(prepareTransaction(receipt, wallet, true, asClient(c))).rejects.toThrow();
    });
});

describe('Exact approval and post-mining allowance', () => {
  const evidence = (): ApprovalEvidence => ({ id: crypto.randomUUID(), status: 'prepared', token, spender: router,
    wallet, amountRaw: '10000000000000000000', transaction: { from: wallet, to: token, value: '0',
      data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [router, 10n * 10n ** 18n] }) } });
  it('rejects unlimited approval calldata', () => {
    expect(() => approvalTransaction(selected().quote!, wallet, [{ dexContractAddress: router, gasLimit: '100000', gasPrice: '1',
      data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [router, maxUint256] }) }])).toThrow('differs');
  });
  it('prepares exactly 10 USDT and never sends a transaction', async () => {
    receipt.intent.executionMode = 'quote';
    const c = chain();
    c.readContract.mockImplementation(async ({ functionName }) => functionName === 'decimals' ? 18 : functionName === 'allowance' ? 0n : 20n * 10n ** 18n);
    const expected = evidence();
    vi.spyOn(BinanceClient.prototype, 'call').mockResolvedValue([{ dexContractAddress: router, gasLimit: '100000', gasPrice: '1', data: expected.transaction.data }]);
    const prepared = await prepareTokenApproval(receipt, wallet, '10', asClient(c));
    expect(prepared).toMatchObject({ status: 'required', amount: expected.amountRaw, transaction: expected.transaction });
  });
  it.each(['confirmed', 'insufficient', 'reverted', 'wrong-wallet', 'pending'])('verifies approval %s', async (state) => {
    const c = chain(), e = evidence();
    c.getTransaction.mockResolvedValue({ ...e.transaction, input: e.transaction.data, value: 0n });
    c.readContract.mockResolvedValue(state === 'insufficient' ? 0n : 10n * 10n ** 18n);
    if (state === 'reverted') c.getTransactionReceipt.mockResolvedValue({ status: 'reverted', blockNumber: 100n, blockHash: hash, logs: [] });
    if (state === 'wrong-wallet') c.getTransaction.mockResolvedValue({ ...e.transaction, from: stock, input: e.transaction.data, value: 0n });
    if (state === 'pending') c.getTransactionReceipt.mockRejectedValue(Object.assign(new Error('Not mined'), { name: 'TransactionReceiptNotFoundError' }));
    if (state === 'wrong-wallet') await expect(verifyTokenApproval(e, hash, asClient(c))).rejects.toThrow('does not match');
    else expect((await verifyTokenApproval(e, hash, asClient(c))).status).toBe(state === 'insufficient' ? 'mismatch' : state);
  });
});

describe('Receipt verification distinguishes chain success from economic correctness', () => {
  function transfer(address: typeof token | typeof stock, from: typeof wallet | typeof router, to: typeof wallet | typeof router, amount: bigint, logIndex: number) {
    return { address, data: encodeAbiParameters([{ type: 'uint256' }], [amount]),
      topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from, to } }), logIndex };
  }
  it.each(['passed', 'debit', 'credit', 'reverted', 'pending', 'target', 'calldata', 'value', 'sender'])('handles %s', async (state) => {
    const c = chain(), q = selected().quote!;
    const logs = [transfer(token, wallet, router, state === 'debit' ? 1n : BigInt(q.amountInRaw), 0),
      transfer(stock, router, wallet, state === 'credit' ? 1n : BigInt(q.amountOutRaw), 1)];
    c.getTransactionReceipt.mockResolvedValue({ status: state === 'reverted' ? 'reverted' : 'success', blockNumber: 100n, blockHash: hash, logs });
    if (state === 'pending') c.getTransactionReceipt.mockRejectedValue(Object.assign(new Error('Not mined'), { name: 'TransactionReceiptNotFoundError' }));
    if (['target', 'calldata', 'value', 'sender'].includes(state)) {
      c.getTransaction.mockResolvedValue({ ...transaction, to: state === 'target' ? stock : router,
        from: state === 'sender' ? stock : wallet, input: state === 'calldata' ? '0xdead' : transaction.data, value: state === 'value' ? 1n : 0n });
      const result = await verifyTransaction(receipt, transaction, hash, asClient(c));
      expect(result).toMatchObject({ status: 'confirmed', verification: 'mismatch', chainEvidence: { transactionMatches: false } });
      expect(result.chainEvidence?.mismatches).toContain(`TRANSACTION_${state === 'sender' ? 'SENDER' : state.toUpperCase()}_MISMATCH`);
      expect(holdExecution).toHaveBeenCalledWith(wallet, 'TRANSACTION_MISMATCH', hash);
      return;
    }
    const result = await verifyTransaction(receipt, transaction, hash, asClient(c));
    expect(result.status).toBe(state === 'pending' ? 'pending' : state === 'reverted' ? 'reverted' : 'confirmed');
    expect(result.verification).toBe(state === 'passed' ? 'passed' : state === 'pending' ? 'pending' : 'mismatch');
    if (state !== 'pending') expect(result.chainEvidence?.transfers).toHaveLength(2);
    if (['debit', 'credit', 'reverted'].includes(state)) expect(holdExecution).toHaveBeenCalled();
  });
  it('does not mislabel an RPC outage as pending', async () => {
    const c = chain(); c.getTransactionReceipt.mockRejectedValue(new Error('network down'));
    await expect(verifyTransaction(receipt, transaction, hash, asClient(c))).rejects.toThrow('lookup failed');
  });
});

describe('Read-only wallet preflight', () => {
  it('reports READY only for the disclosed preflight budget and allowance', async () => {
    const c = chain(), result = await walletReadiness(wallet, '10', router, asClient(c));
    expect(result).toMatchObject({ status: 'READY', reasons: [], chainId: 56, transactionsBroadcast: 0 });
    for (const [args] of c.readContract.mock.calls) expect(args).toHaveProperty('blockNumber', 100n);
  });
  it('explains missing funds, unknown spender and allowance', async () => {
    const c = chain(); c.getBalance.mockResolvedValue(0n);
    c.readContract.mockImplementation(async ({ functionName }) => functionName === 'decimals' ? 18 : 0n);
    const result = await walletReadiness(wallet, '10', router, asClient(c));
    expect(result.reasons).toEqual(expect.arrayContaining(['INSUFFICIENT_USDT', 'INSUFFICIENT_BNB', 'INSUFFICIENT_ALLOWANCE']));
    expect((await walletReadiness(wallet, '10', undefined, asClient(c))).reasons).toContain('UNKNOWN_SPENDER');
  });
});
