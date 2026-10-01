import { describe, expect, it, vi } from 'vitest';
import { sendBrowserTransaction } from '../packages/execution/browser';

const wallet = '0x1111111111111111111111111111111111111111';
const other = '0x2222222222222222222222222222222222222222';
const transaction = { from: wallet, to: other, value: '0', data: '0x1234' };
const hash = `0x${'a'.repeat(64)}`;
describe('Browser wallet checks immediately before signature', () => {
  it('sends exactly the prepared EVM fields after checking current chain and account', async () => {
    const request = vi.fn().mockResolvedValueOnce('0x38').mockResolvedValueOnce([wallet]).mockResolvedValueOnce(hash);
    expect(await sendBrowserTransaction({ request }, { ...transaction, gas: '999', slippagePercent: '0.5' } as typeof transaction, wallet)).toBe(hash);
    expect(request.mock.calls.map(([args]) => args.method)).toEqual(['eth_chainId', 'eth_accounts', 'eth_sendTransaction']);
    expect(request.mock.calls[2][0].params).toEqual([{ ...transaction, value: '0x0', chainId: '0x38' }]);
  });
  it.each(['chain', 'account', 'from'])('refuses %s changes before requesting any signature', async (problem) => {
    const request = vi.fn().mockResolvedValueOnce(problem === 'chain' ? '0x1' : '0x38').mockResolvedValueOnce([other]);
    await expect(sendBrowserTransaction({ request }, problem === 'from' ? { ...transaction, from: other } : transaction, wallet)).rejects.toThrow();
    expect(request.mock.calls.some(([args]) => args.method === 'eth_sendTransaction')).toBe(false);
  });
  it('rejects invalid returned hashes with a recovery message that prevents blind resubmission', async () => {
    const request = vi.fn().mockResolvedValueOnce('0x38').mockResolvedValueOnce([wallet]).mockResolvedValueOnce('invalid');
    await expect(sendBrowserTransaction({ request }, transaction, wallet)).rejects.toThrow('Inspect wallet activity');
  });
});
