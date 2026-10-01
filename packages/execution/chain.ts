import { createPublicClient, http, erc20Abi, type Address } from 'viem';
import { bsc } from 'viem/chains';
import { z } from 'zod';
import { address, toRaw, type Evaluation, type Policy } from '../core/domain';

export function rpc() {
  return createPublicClient({
    chain: bsc,
    transport: http(process.env.BSC_RPC_URL ?? 'https://bsc-dataseed.bnbchain.org', {
      timeout: 10000,
      retryCount: 1,
    }),
  });
}
export type ChainClient = ReturnType<typeof rpc>;
export function configuredUsdt() {
  const parsed = address.safeParse(process.env.ATLAS_USDT_ADDRESS);
  if (!parsed.success) throw new Error('INVALID_USDT_CONTRACT: Configure ATLAS_USDT_ADDRESS.');
  const decimals = z.coerce.number().int().min(0).max(36).parse(process.env.ATLAS_USDT_DECIMALS ?? 18);
  return { address: parsed.data as Address, decimals };
}
export async function requireBsc(client: ChainClient) {
  if ((await client.getChainId()) !== 56) throw new Error('INVALID_CHAIN: RPC must use BSC mainnet (56).');
}
export function requireAllowed(contract: string, label: string) {
  address.parse(contract);
  const allowed = (process.env.ATLAS_ALLOWED_ROUTERS ?? '').split(',').map((v) => v.trim()).filter(Boolean);
  if (!allowed.length || allowed.some((v) => !address.safeParse(v).success) ||
    !allowed.some((v) => v.toLowerCase() === contract.toLowerCase()))
    throw new Error(`${label} is not on the operator-verified allowlist. OPERATOR REVIEW REQUIRED.`);
}
export async function requireCode(client: ChainClient, contract: string, label: string, blockNumber?: bigint) {
  const code = await client.getBytecode({ address: address.parse(contract) as Address, blockNumber });
  if (!code || code === '0x') throw new Error(`${label} has no contract bytecode on BSC.`);
  return code;
}
export async function verifyToken(client: ChainClient, contract: string, decimals: number, blockNumber?: bigint) {
  await requireCode(client, contract, 'Token', blockNumber);
  const actual = await client.readContract({ address: contract as Address, abi: erc20Abi, functionName: 'decimals', blockNumber });
  if (actual !== decimals) throw new Error(`TOKEN_DECIMALS_MISMATCH: configured ${decimals}, on-chain ${actual}. Live execution blocked.`);
  return actual;
}
export async function verifyQuoteTokens(client: ChainClient, policy: Policy, route: Evaluation, wallet: string) {
  const usdt = configuredUsdt(), q = route.quote!;
  const stock = route.representation;
  const input = policy.side === 'buy' ? usdt.address : stock.tokenAddress;
  const output = policy.side === 'buy' ? stock.tokenAddress : usdt.address;
  const inputDecimals = policy.side === 'buy' ? usdt.decimals : stock.decimals;
  const outputDecimals = policy.side === 'buy' ? stock.decimals : usdt.decimals;
  if (stock.demo || q.inputToken.toLowerCase() !== input.toLowerCase() || q.outputToken.toLowerCase() !== output.toLowerCase() ||
    q.inputDecimals !== inputDecimals || q.outputDecimals !== outputDecimals ||
    q.amountInRaw !== toRaw(policy.amount, inputDecimals) || q.amountIn !== policy.amount ||
    q.recipient?.toLowerCase() !== wallet.toLowerCase())
    throw new Error('QUOTE_MISMATCH: token, amount, decimals or recipient differs from the policy.');
  await Promise.all([verifyToken(client, usdt.address, usdt.decimals), verifyToken(client, stock.tokenAddress, stock.decimals)]);
}
