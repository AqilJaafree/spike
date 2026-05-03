import { keccak256, toHex } from 'viem';

/** Returns a hex-encoded keccak256 hash of the given bytes — used as the on-chain fingerprint */
export function keccak256Fingerprint(publicKey: Uint8Array): string {
  return keccak256(toHex(publicKey));
}

/** Derives a 32-byte seed from a wallet-signed nonce using HKDF-SHA256 */
export async function deriveWalletSeed(signedNonce: Uint8Array): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey('raw', signedNonce, 'HKDF', false, ['deriveKey', 'deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode('spike-pqc-v1') },
    baseKey,
    256
  );
  return new Uint8Array(bits);
}
