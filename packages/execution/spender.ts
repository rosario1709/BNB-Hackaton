import { encodeFunctionData, erc20Abi, type Address } from 'viem';
import { BinanceClient } from '../binance-web3/client';
import { approvalSchema } from '../binance-web3/schemas';
import { address, type Quote } from '../core/domain';

/** Null approveTarget can mean already approved. Resolve the vendor's actual spender, never assume it is tx.to. */
export async function resolveSpender(quote: Quote): Promise<string> {
  if (quote.approveTarget) return address.parse(quote.approveTarget);
  const rows = await new BinanceClient().call('Trading', '/api/v1/dex/aggregator/approve-transaction', approvalSchema, {
    binanceChainId: '56', tokenContractAddress: quote.inputToken, approveAmount: quote.amountInRaw, vendor: quote.vendor,
  });
  if (rows.length !== 1) throw new Error('UNKNOWN_SPENDER: expected one vendor approval target.');
  const spender = address.parse(rows[0].dexContractAddress);
  const expected = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender as Address, BigInt(quote.amountInRaw)] });
  if (rows[0].data.toLowerCase() !== expected.toLowerCase()) throw new Error('Approval amount or calldata differs from the quote.');
  return spender;
}
