import type { KyberKeypair, KyberEncryptResult } from './types.js';
import { keccak256Fingerprint } from './utils.js';

// Algorithm: Kyber-1024 (NIST FIPS 203 — ML-KEM-1024)
const ALG = 'Kyber1024';

async function getOQS() {
  const { OQS } = await import('liboqs-js');
  return OQS;
}

export async function generateKyberKeypair(): Promise<KyberKeypair> {
  const OQS = await getOQS();
  const kem = new OQS.KeyEncapsulation(ALG);
  const { publicKey, secretKey } = kem.keypair();
  kem.free();
  return {
    publicKey,
    secretKey,
    fingerprint: keccak256Fingerprint(publicKey),
  };
}

/** Encapsulate: generates a shared secret encrypted under the recipient's public key */
export async function kyberEncapsulate(
  recipientPublicKey: Uint8Array
): Promise<KyberEncryptResult> {
  const OQS = await getOQS();
  const kem = new OQS.KeyEncapsulation(ALG);
  const { ciphertext, sharedSecret } = kem.encapsulate(recipientPublicKey);
  kem.free();
  return { ciphertext, sharedSecret };
}

/** Decapsulate: recovers shared secret using secret key */
export async function kyberDecapsulate(
  secretKey: Uint8Array,
  ciphertext: Uint8Array
): Promise<Uint8Array> {
  const OQS = await getOQS();
  const kem = new OQS.KeyEncapsulation(ALG);
  const sharedSecret = kem.decapsulate(ciphertext, secretKey);
  kem.free();
  return sharedSecret;
}

/** Encrypt arbitrary plaintext using AES-256-GCM keyed by the Kyber shared secret */
export async function kyberEncrypt(
  recipientPublicKey: Uint8Array,
  plaintext: Uint8Array
): Promise<{ ciphertext: Uint8Array; encapsulatedKey: Uint8Array; iv: Uint8Array }> {
  const { ciphertext: encapsulatedKey, sharedSecret } = await kyberEncapsulate(recipientPublicKey);

  // Derive AES key from shared secret via Web Crypto
  const cryptoKey = await crypto.subtle.importKey('raw', sharedSecret, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, plaintext);

  return {
    ciphertext: new Uint8Array(encrypted),
    encapsulatedKey,
    iv,
  };
}

/** Decrypt plaintext using secret key + encapsulated key */
export async function kyberDecrypt(
  secretKey: Uint8Array,
  encapsulatedKey: Uint8Array,
  ciphertext: Uint8Array,
  iv: Uint8Array
): Promise<Uint8Array> {
  const sharedSecret = await kyberDecapsulate(secretKey, encapsulatedKey);
  const cryptoKey = await crypto.subtle.importKey('raw', sharedSecret, 'AES-GCM', false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ciphertext);
  return new Uint8Array(decrypted);
}
