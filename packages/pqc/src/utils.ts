import { keccak256, toHex } from 'viem';

const ab = (u: Uint8Array): Uint8Array<ArrayBuffer> => u as Uint8Array<ArrayBuffer>;

export function keccak256Fingerprint(publicKey: Uint8Array): string {
  return keccak256(toHex(publicKey));
}

export async function deriveWalletSeed(signedNonce: Uint8Array): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey('raw', ab(signedNonce), 'HKDF', false, ['deriveKey', 'deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode('spike-pqc-v1') },
    baseKey,
    256
  );
  return new Uint8Array(bits);
}
