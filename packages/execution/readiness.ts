import { erc20Abi, formatEther, formatUnits, type Address } from 'viem';
import { address, positive, toRaw } from '../core/domain';
import { configuredUsdt, rpc, type ChainClient } from './chain';

// A disclosed preflight budget only. Actual approval/SWAP estimates remain mandatory.
export const PREFLIGHT_GAS_UNITS = 600000n;
export async function walletReadiness(wallet: string, amount = '10', spender?: string, client: ChainClient = rpc()) {
  const owner = address.parse(wallet) as Address;
  positive.parse(amount);
  if (spender) address.parse(spender);
  const reasons: string[] = [];
  const chainId = await client.getChainId();
  if (chainId !== 56) return { status: 'NOT READY', reasons: ['INVALID_CHAIN'], chainId, transactionsBroadcast: 0 };
  const usdt = configuredUsdt();
  const blockNumber = await client.getBlockNumber();
  const [bnb, code, spenderCode, gasPrice] = await Promise.all([
    client.getBalance({ address: owner, blockNumber }),
    client.getBytecode({ address: usdt.address, blockNumber }),
    spender ? client.getBytecode({ address: spender as Address, blockNumber }) : undefined,
    client.getGasPrice(),
  ]);
  const gasBudget = (PREFLIGHT_GAS_UNITS * gasPrice * 12n + 9n) / 10n;
  if (bnb < gasBudget) reasons.push('INSUFFICIENT_BNB');
  if (!code || code === '0x') reasons.push('INVALID_USDT_CONTRACT');
  if (!spender || !spenderCode || spenderCode === '0x') reasons.push('UNKNOWN_SPENDER');
  let token: { balance: string; decimals: number; configuredDecimals: number; decimalsMatch: boolean; hasProbeAmount: boolean; allowance?: string; hasProbeAllowance?: boolean } | undefined;
  if (code && code !== '0x') {
    try {
      const [balance, decimals, allowance] = await Promise.all([
        client.readContract({ address: usdt.address, abi: erc20Abi, functionName: 'balanceOf', args: [owner], blockNumber }),
        client.readContract({ address: usdt.address, abi: erc20Abi, functionName: 'decimals', blockNumber }),
        spender ? client.readContract({ address: usdt.address, abi: erc20Abi, functionName: 'allowance', args: [owner, spender as Address], blockNumber }) : undefined,
      ]);
      const required = BigInt(toRaw(amount, decimals));
      if (decimals !== usdt.decimals) reasons.push('TOKEN_DECIMALS_MISMATCH');
      if (balance < required) reasons.push('INSUFFICIENT_USDT');
      if (allowance !== undefined && allowance < required) reasons.push('INSUFFICIENT_ALLOWANCE');
      token = { balance: formatUnits(balance, decimals), decimals, configuredDecimals: usdt.decimals, decimalsMatch: decimals === usdt.decimals, hasProbeAmount: balance >= required,
        ...(allowance !== undefined ? { allowance: formatUnits(allowance, decimals), hasProbeAllowance: allowance >= required } : {}) };
    } catch { reasons.push('INVALID_USDT_CONTRACT'); }
  }
  return { checkedAt: new Date().toISOString(), status: reasons.length ? 'NOT READY' : 'READY', reasons, wallet: owner, chainId,
    blockNumber: blockNumber.toString(), bnb: formatEther(bnb), gasBudgetBnb: formatEther(gasBudget),
    gasBudgetBasis: `${PREFLIGHT_GAS_UNITS} gas units plus 20%; exact transaction estimates still required`,
    usdt: { address: usdt.address, hasBytecode: !!code && code !== '0x', probeAmount: amount, ...token },
    spender: spender ? { address: spender, hasBytecode: !!spenderCode && spenderCode !== '0x' } : null,
    notice: 'Read-only wallet preflight. READY is not permission to trade; policy, allowlist and exact simulation remain required.', transactionsBroadcast: 0 };
}
