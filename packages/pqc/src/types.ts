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
