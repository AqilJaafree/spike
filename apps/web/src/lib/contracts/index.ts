import { keccak256 } from 'viem';

export const PQC_REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_PQC_KEY_REGISTRY as `0x${string}` | undefined;
export const AGENT_REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_AGENT_REGISTRY as `0x${string}` | undefined;
export const SKILL_REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_SKILL_REGISTRY as `0x${string}` | undefined;
export const AGENT_NFT_ADDRESS = process.env.NEXT_PUBLIC_AGENT_NFT as `0x${string}` | undefined;

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
    name: 'rotate',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'newDilithiumFingerprint', type: 'bytes32' },
      { name: 'newKyberFingerprint', type: 'bytes32' },
      { name: 'newStorageRoot', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'revoke',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    name: 'isRegistered',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'wallet', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'getKeys',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'wallet', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'dilithiumFingerprint', type: 'bytes32' },
          { name: 'kyberFingerprint', type: 'bytes32' },
          { name: 'storageRoot', type: 'bytes32' },
          { name: 'registeredAt', type: 'uint256' },
          { name: 'updatedAt', type: 'uint256' },
          { name: 'active', type: 'bool' },
        ],
      },
    ],
  },
] as const;

export const AGENT_REGISTRY_ABI = [
  {
    name: 'deployAgent',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'configRoot', type: 'bytes32' },
      { name: 'actionSigFingerprint', type: 'bytes32' },
      { name: 'attestationId', type: 'bytes32' },
      { name: 'skillKey', type: 'bytes32' },
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
    name: 'recordAction',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'actionHash', type: 'bytes32' },
      { name: 'success', type: 'bool' },
      { name: 'pnlBasisPoints', type: 'int256' },
    ],
    outputs: [],
  },
  {
    name: 'getPerformanceScore',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'totalActions', type: 'uint256' },
          { name: 'successCount', type: 'uint256' },
          { name: 'pnlBasisPoints', type: 'int256' },
          { name: 'lastUpdatedAt', type: 'uint256' },
        ],
      },
    ],
  },
  {
    name: 'updateConfig',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'newConfigRoot', type: 'bytes32' },
      { name: 'newActionSigFingerprint', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'withdrawAgent',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'getAgent',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'owner', type: 'address' },
          { name: 'configRoot', type: 'bytes32' },
          { name: 'actionSigFingerprint', type: 'bytes32' },
          { name: 'attestationId', type: 'bytes32' },
          { name: 'skillKey', type: 'bytes32' },
          { name: 'status', type: 'uint8' },
          { name: 'deployedAt', type: 'uint256' },
          { name: 'lastActionAt', type: 'uint256' },
          { name: 'rebalanceCount', type: 'uint256' },
        ],
      },
    ],
  },
  {
    name: 'getOwnerAgents',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
  {
    name: 'AgentDeployed',
    type: 'event',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'configRoot', type: 'bytes32', indexed: false },
      { name: 'attestationId', type: 'bytes32', indexed: false },
      { name: 'skillKey', type: 'bytes32', indexed: false },
    ],
  },
] as const;

export const SKILL_REGISTRY_ABI = [
  {
    name: 'getSkill',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'skillKey', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'id', type: 'string' },
          { name: 'name', type: 'string' },
          { name: 'category', type: 'uint8' },
          { name: 'storageHash', type: 'bytes32' },
          { name: 'active', type: 'bool' },
          { name: 'registeredAt', type: 'uint256' },
        ],
      },
    ],
  },
  {
    name: 'isActive',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'skillKey', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'getAllSkills',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'id', type: 'string' },
          { name: 'name', type: 'string' },
          { name: 'category', type: 'uint8' },
          { name: 'storageHash', type: 'bytes32' },
          { name: 'active', type: 'bool' },
          { name: 'registeredAt', type: 'uint256' },
        ],
      },
    ],
  },
  {
    name: 'skillCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export const AGENT_NFT_ABI = [
  // ─── ERC-721 ──────────────────────────────────────────────────────────────
  {
    name: 'ownerOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'tokenURI',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }],
  },
  // ─── Spike metadata ───────────────────────────────────────────────────────
  {
    name: 'getAgentMeta',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'dilithiumFingerprint', type: 'bytes32' },
          { name: 'configRoot', type: 'bytes32' },
          { name: 'actionSigFingerprint', type: 'bytes32' },
          { name: 'skillKey', type: 'bytes32' },
          { name: 'mintedAt', type: 'uint256' },
        ],
      },
    ],
  },
  // ─── ERC-7857 ─────────────────────────────────────────────────────────────
  {
    name: 'intelligentDataOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_tokenId', type: 'uint256' }],
    outputs: [
      {
        name: 'data',
        type: 'tuple[]',
        components: [
          { name: 'dataDescription', type: 'string' },
          { name: 'dataHash', type: 'bytes32' },
        ],
      },
    ],
  },
  {
    name: 'authorizedUsersOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address[]' }],
  },
  {
    name: 'getDelegateAccess',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_user', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'authorizeUsage',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_tokenId', type: 'uint256' },
      { name: '_user', type: 'address' },
    ],
    outputs: [],
  },
  {
    name: 'revokeAuthorization',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_tokenId', type: 'uint256' },
      { name: '_user', type: 'address' },
    ],
    outputs: [],
  },
  {
    name: 'delegateAccess',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_assistant', type: 'address' }],
    outputs: [],
  },
  {
    name: 'iTransfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_to', type: 'address' },
      { name: '_tokenId', type: 'uint256' },
      { name: '_proofs', type: 'tuple[]', components: [] },
    ],
    outputs: [],
  },
  {
    name: 'iClone',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_to', type: 'address' },
      { name: '_tokenId', type: 'uint256' },
      { name: '_proofs', type: 'tuple[]', components: [] },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // ─── ERC-7857 events ──────────────────────────────────────────────────────
  {
    name: 'Authorization',
    type: 'event',
    inputs: [
      { name: '_from',    type: 'address', indexed: true },
      { name: '_to',      type: 'address', indexed: true },
      { name: '_tokenId', type: 'uint256', indexed: true },
    ],
  },
  {
    name: 'AuthorizationRevoked',
    type: 'event',
    inputs: [
      { name: '_from',    type: 'address', indexed: true },
      { name: '_to',      type: 'address', indexed: true },
      { name: '_tokenId', type: 'uint256', indexed: true },
    ],
  },
  {
    name: 'Cloned',
    type: 'event',
    inputs: [
      { name: '_tokenId',    type: 'uint256', indexed: true },
      { name: '_newTokenId', type: 'uint256', indexed: true },
      { name: '_from',       type: 'address', indexed: false },
      { name: '_to',         type: 'address', indexed: false },
    ],
  },
] as const;

export function fingerprintToBytes32(fp: string): `0x${string}` {
  if (/^0x[0-9a-f]{64}$/i.test(fp)) return fp as `0x${string}`;
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
    if (log.address.toLowerCase() === addr && log.topics.length >= 2) {
      return BigInt(log.topics[1]);
    }
  }
  return null;
}
