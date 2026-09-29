import { it, expect } from 'vitest';
import { publicTokensSchema } from '../packages/market/public';
it('filters non-EVM chains before EVM validation and accepts actual observed BSC decimals', () => {
  expect(
    publicTokensSchema.parse([
      { chainId: 'CT_501', contractAddress: 'NonEvmBase58Value' },
      {
        chainId: '56',
        contractAddress: '0x1111111111111111111111111111111111111111',
        symbol: 'TEST',
        ticker: 'TEST',
        type: 3,
        multiplier: '1',
        assetType: 1,
        d: 18,
      },
    ]),
  ).toHaveLength(1);
});
it('never accepts malformed BSC contracts', () => {
  expect(() =>
    publicTokensSchema.parse([
      {
        chainId: '56',
        contractAddress: 'bad',
        symbol: 'TEST',
        ticker: 'TEST',
        type: 1,
        multiplier: '1',
      },
    ]),
  ).toThrow();
});
