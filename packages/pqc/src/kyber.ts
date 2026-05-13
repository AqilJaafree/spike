import { ml_kem1024 } from '@noble/post-quantum/ml-kem.js';
import type { KyberKeypair, KyberEncryptResult } from './types.js';
import { keccak256Fingerprint } from './utils.js';

// TypeScript 5.9 stricter generics: Uint8Array<ArrayBufferLike> != ArrayBufferView<ArrayBuffer>.
// @noble returns fresh ArrayBuffer-backed arrays; this cast is safe.
const ab = (u: Uint8Array): Uint8Array<ArrayBuffer> => u as unknown as Uint8Array<ArrayBuffer>;

export function generateKyberKeypair(): KyberKeypair {
  const seed = crypto.getRandomValues(new Uint8Array(64));
  const { secretKey, publicKey } = ml_kem1024.keygen(seed);
  return { publicKey, secretKey, fingerprint: keccak256Fingerprint(publicKey) };
}

export function kyberEncapsulate(recipientPublicKey: Uint8Array): KyberEncryptResult {
  const seed = crypto.getRandomValues(new Uint8Array(32));
  const { cipherText, sharedSecret } = ml_kem1024.encapsulate(recipientPublicKey, seed);
  return { ciphertext: cipherText, sharedSecret };
}

export function kyberDecapsulate(secretKey: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  return ml_kem1024.decapsulate(ciphertext, secretKey);
}

export async function kyberEncrypt(
  recipientPublicKey: Uint8Array,
  plaintext: Uint8Array
): Promise<{ ciphertext: Uint8Array; encapsulatedKey: Uint8Array; iv: Uint8Array }> {
  const { ciphertext: encapsulatedKey, sharedSecret } = kyberEncapsulate(recipientPublicKey);
  const cryptoKey = await crypto.subtle.importKey('raw', ab(sharedSecret), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, ab(plaintext));
  return { ciphertext: new Uint8Array(encrypted), encapsulatedKey, iv };
}

export async function kyberDecrypt(
  secretKey: Uint8Array,
  encapsulatedKey: Uint8Array,
  ciphertext: Uint8Array,
  iv: Uint8Array
): Promise<Uint8Array> {
  const sharedSecret = kyberDecapsulate(secretKey, encapsulatedKey);
  const cryptoKey = await crypto.subtle.importKey('raw', ab(sharedSecret), 'AES-GCM', false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ab(iv) }, cryptoKey, ab(ciphertext));
  return new Uint8Array(decrypted);
}
