import { keccak256 } from 'viem';

export const PQC_REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_PQC_KEY_REGISTRY as `0x${string}` | undefined;
export const AGENT_REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_AGENT_REGISTRY as `0x${string}` | undefined;

export const PQC_REGISTRY_ABI = [
  {
    name: 'register',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'dilithiumFingerprint', type: 'bytes32' },
      { name: 'kyberFingerprint', type: 'bytes32' },
      { name: 'storageRoot', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'isRegistered',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'wallet', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export const AGENT_REGISTRY_ABI = [
  {
    name: 'deployAgent',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'configRoot', type: 'bytes32' },
      { name: 'dilithiumSig', type: 'bytes32' },
      { name: 'attestationId', type: 'bytes32' },
    ],
    outputs: [{ name: 'agentId', type: 'uint256' }],
  },
  {
    name: 'pauseAgent',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'resumeAgent',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'AgentDeployed',
    type: 'event',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'configRoot', type: 'bytes32', indexed: false },
      { name: 'attestationId', type: 'bytes32', indexed: false },
    ],
  },
] as const;

export function fingerprintToBytes32(fp: string): `0x${string}` {
  if (/^0x[0-9a-f]{64}$/i.test(fp)) return fp as `0x${string}`;
  // Demo/fallback format — hash it deterministically
  return keccak256(new TextEncoder().encode(fp));
}

export function configToBytes32(config: unknown): `0x${string}` {
  return keccak256(new TextEncoder().encode(JSON.stringify(config)));
}

export function parseAgentIdFromReceipt(
  receipt: { logs: Array<{ address: string; topics: readonly string[] }> }
): bigint | null {
  const addr = AGENT_REGISTRY_ADDRESS?.toLowerCase();
  if (!addr) return null;
  for (const log of receipt.logs) {
    // AgentDeployed: topics[0]=sig, topics[1]=agentId (indexed uint256), topics[2]=owner
    if (log.address.toLowerCase() === addr && log.topics.length >= 2) {
      return BigInt(log.topics[1]);
    }
  }
  return null;
}
