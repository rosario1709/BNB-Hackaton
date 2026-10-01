import { describe, it, expect } from 'vitest';
import { evaluateRoutes } from '../packages/core/router';
import { DemoAdapter } from '../packages/market/demo';
import { policySchema } from '../packages/core/domain';
import { executionGate, tradeLimitAmount } from '../packages/execution';
import { approvalTransaction, prepareTokenApproval } from '../packages/execution/approval';
import { encodeFunctionData, erc20Abi, type Address } from 'viem';
import { getReceipt, saveReceipt, listReceipts } from '../packages/db';
async function report() {
  return evaluateRoutes(
    {
      ...policySchema.parse({ ticker: 'NVDA', amount: '10' }),
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    },
    new DemoAdapter(),
  );
}
describe('Execution boundary', () => {
  it('live is disabled by default', async () => {
    const r = await report();
    expect(() => executionGate(r, true, false, '10')).toThrow('disabled');
  });
  it('requires explicit confirmation', async () => {
    const r = await report();
    expect(() => executionGate(r, false, true, '10')).toThrow('confirmation');
  });
  it('demo simulation cannot broadcast', async () => {
    const r = await report();
    expect(() => executionGate(r, true, true, '10')).toThrow('cannot broadcast');
  });
  it('live-data simulation mode cannot broadcast', async () => {
    const r = await report();
    r.dataMode = 'live';
    expect(() => executionGate(r, true, true, '10')).toThrow('cannot broadcast');
  });
  it('rejected policy cannot broadcast', async () => {
    const r = await report();
    r.dataMode = 'live';
    r.intent.executionMode = 'live';
    r.decision = 'blocked';
    expect(() => executionGate(r, true, true, '10')).toThrow('Rejected');
  });
  it('failed simulation cannot broadcast', async () => {
    const r = await report();
    r.dataMode = 'live';
    r.intent.executionMode = 'live';
    r.candidates.find((c) => c.id === r.selectedRouteId)!.simulation!.success = false;
    expect(() => executionGate(r, true, true, '10')).toThrow('verified simulation');
  });
  it('caps a USDT buy by the exact input amount despite a small vendor peg difference', async () => {
    const r = await report();
    const selected = r.candidates.find((candidate) => candidate.id === r.selectedRouteId)!;
    selected.quote!.inputPriceUsd = '1.01';
    expect(tradeLimitAmount(r, selected).toFixed()).toBe('10');
    r.dataMode = 'live';
    r.intent.executionMode = 'live';
    selected.simulation!.kind = 'binance';
    selected.simulation!.transaction = {
      from: '0x2222222222222222222222222222222222222222',
      to: '0x3333333333333333333333333333333333333333',
      value: '0',
      data: '0x',
    };
    expect(executionGate(r, true, true, '10')).toBe(selected);
  });
  it('accepts only an exact, spender-matched token approval', async () => {
    const r = await report();
    const quote = r.candidates.find((candidate) => candidate.id === r.selectedRouteId)!.quote!;
    const spender = '0x3333333333333333333333333333333333333333';
    const wallet = '0x2222222222222222222222222222222222222222';
    quote.inputToken = '0x1111111111111111111111111111111111111111';
    quote.approveTarget = spender;
    const rows = [
      {
        dexContractAddress: spender,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [spender as Address, BigInt(quote.amountInRaw)],
        }),
        gasLimit: '50000',
        gasPrice: '1000000000',
      },
    ];
    expect(approvalTransaction(quote, wallet, rows)).toMatchObject({
      from: wallet,
      to: quote.inputToken,
      value: '0',
      data: rows[0].data,
    });
    const wrongAmount = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [spender as Address, BigInt(quote.amountInRaw) + 1n],
    });
    expect(() => approvalTransaction(quote, wallet, [{ ...rows[0], data: wrongAmount }])).toThrow(
      'differs',
    );
    expect(() =>
      approvalTransaction(quote, wallet, [
        { ...rows[0], dexContractAddress: '0x4444444444444444444444444444444444444444' },
      ]),
    ).toThrow('differs');
  });
  it('requires live quote policy evidence and the trade cap before preparing approval', async () => {
    const wallet = '0x2222222222222222222222222222222222222222';
    const r = await report();
    await expect(prepareTokenApproval(r, wallet, '10')).rejects.toThrow('fresh live-data');
    r.dataMode = 'live';
    r.intent.executionMode = 'quote';
    r.decision = 'blocked';
    await expect(prepareTokenApproval(r, wallet, '10')).rejects.toThrow('Policy checks');
    r.decision = 'approved';
    await expect(prepareTokenApproval(r, wallet, '1')).rejects.toThrow('Mainnet trade limit');
  });
  it('receipts are immutable copies and isolated by owner', async () => {
    const r = await report();
    await saveReceipt('owner-a', r);
    r.reason = 'changed outside store';
    expect((await getReceipt('owner-a', r.id))?.reason).not.toBe(r.reason);
    expect(await getReceipt('owner-b', r.id)).toBeUndefined();
    expect(await listReceipts('owner-b')).toHaveLength(0);
  });
});
