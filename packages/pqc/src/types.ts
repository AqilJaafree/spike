export interface DilithiumKeypair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  /** keccak256 fingerprint of publicKey — stored on-chain in PQCKeyRegistry */
  fingerprint: string;
}

export interface KyberKeypair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  /** keccak256 fingerprint of publicKey — stored on-chain in PQCKeyRegistry */
  fingerprint: string;
}

export interface KyberEncryptResult {
  ciphertext: Uint8Array;
  sharedSecret: Uint8Array;
}

export interface SignResult {
  signature: Uint8Array;
  message: Uint8Array;
}

/** Structured envelope for replay-safe ML-DSA action signing. */
export interface ActionEnvelope {
  /** EVM chain ID — prevents cross-chain replay. */
  chainId: bigint;
  /** Contract the action targets — prevents cross-contract replay. */
  contractAddress: `0x${string}`;
  /** Monotonic counter or timestamp — prevents same-chain replay. */
  nonce: bigint;
  /** keccak256 / sha256 hash of the action payload. */
  actionHash: `0x${string}`;
  /** Human-readable action discriminator, e.g. 'rebalance'. */
  actionType: string;
}
