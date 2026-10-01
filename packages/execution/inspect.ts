import { keccak256, toBytes, toHex, type Address, type Hex } from 'viem';
import { address } from '../core/domain';
import { rpc, requireBsc, type ChainClient } from './chain';
const slot = (name: string) => toHex(BigInt(keccak256(toBytes(`eip1967.proxy.${name}`))) - 1n, { size: 32 });
const slotAddress = (value?: Hex) => value && /^0x0{24}[a-fA-F0-9]{40}$/.test(value) && BigInt(value) !== 0n ? `0x${value.slice(-40)}` as Address : undefined;
export async function inspectContract(contract: string, client: ChainClient = rpc()) {
  const target = address.parse(contract) as Address;
  await requireBsc(client);
  const blockNumber = await client.getBlockNumber();
  const code = await client.getBytecode({ address: target, blockNumber });
  const slots = await Promise.allSettled(['implementation', 'beacon', 'admin'].map((name) => client.getStorageAt({ address: target, slot: slot(name), blockNumber })));
  const values = slots.map((result) => result.status === 'fulfilled' ? slotAddress(result.value) : undefined);
  const clone = code?.match(/^0x363d3d373d3d3d363d73([a-fA-F0-9]{40})5af43d82803e903d91602b57fd5bf3$/);
  let implementation = values[0] ?? (clone ? `0x${clone[1]}` as Address : undefined);
  let beaconError: string | undefined;
  if (!implementation && values[1]) try {
    implementation = await client.readContract({ address: values[1], abi: [{ type: 'function', name: 'implementation', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }] as const, functionName: 'implementation', blockNumber });
  } catch { beaconError = 'Beacon implementation lookup unavailable'; }
  const implementationCode = implementation ? await client.getBytecode({ address: implementation, blockNumber }) : undefined;
  return { address: target, chainId: 56, blockNumber: blockNumber.toString(), hasBytecode: !!code && code !== '0x',
    bytecodeHash: code && code !== '0x' ? keccak256(code) : undefined,
    proxyDetection: values[0] ? 'EIP-1967 implementation slot' : values[1] ? 'EIP-1967 beacon slot' : clone ? 'EIP-1167 minimal proxy' : 'No recognized marker; custom proxies are not excluded',
    implementation, implementationHasBytecode: implementation ? !!implementationCode && implementationCode !== '0x' : undefined,
    beacon: values[1], admin: values[2], beaconError, storageReadFailures: slots.filter((v) => v.status === 'rejected').length,
    status: 'OPERATOR REVIEW REQUIRED', review: ['Verify official vendor deployment/provenance', 'Review source, implementation and upgrade/admin permissions', 'Compare quote spender, token addresses and built tx.to', 'Review allowance scope and risk before editing ATLAS_ALLOWED_ROUTERS'],
    explorer: `https://bscscan.com/address/${target}#code` };
}
