import { address, txSchema, type Transaction } from '../core/domain';

export interface BrowserWallet {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, listener: (value: unknown) => void): void;
  removeListener?(event: string, listener: (value: unknown) => void): void;
}

export async function requireBrowserWallet(provider: BrowserWallet, expected: string) {
  address.parse(expected);
  if (await provider.request({ method: 'eth_chainId' }) !== '0x38')
    throw new Error('Switch your wallet to BNB Smart Chain mainnet (56).');
  const accounts = await provider.request({ method: 'eth_accounts' });
  if (!Array.isArray(accounts) || typeof accounts[0] !== 'string' || accounts[0].toLowerCase() !== expected.toLowerCase())
    throw new Error('Wallet account changed. Reconnect and evaluate again.');
}

/** Called only from an explicit user-confirmation handler. The provider owns signing. */
export async function sendBrowserTransaction(provider: BrowserWallet, transaction: Transaction, wallet: string) {
  const exact = txSchema.parse(transaction);
  if (exact.from.toLowerCase() !== wallet.toLowerCase()) throw new Error('Prepared transaction belongs to a different wallet.');
  await requireBrowserWallet(provider, wallet);
  const hash = await provider.request({ method: 'eth_sendTransaction', params: [{
    ...exact, value: '0x' + BigInt(exact.value).toString(16), chainId: '0x38',
  }] });
  if (typeof hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(hash))
    throw new Error('Wallet did not return a valid BSC transaction hash. Inspect wallet activity before retrying.');
  return hash;
}
