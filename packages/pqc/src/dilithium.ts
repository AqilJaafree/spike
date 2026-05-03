import { ml_dsa65 } from '@noble/post-quantum/ml-dsa';
import type { DilithiumKeypair, SignResult } from './types.js';
import { keccak256Fingerprint } from './utils.js';

export function generateDilithiumKeypair(): DilithiumKeypair {
  const seed = crypto.getRandomValues(new Uint8Array(32));
  const { secretKey, publicKey } = ml_dsa65.keygen(seed);
  return { publicKey, secretKey, fingerprint: keccak256Fingerprint(publicKey) };
}

export function dilithiumSign(secretKey: Uint8Array, message: Uint8Array): SignResult {
  const signature = ml_dsa65.sign(secretKey, message);
  return { signature, message };
}

export function dilithiumVerify(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array
): boolean {
  return ml_dsa65.verify(publicKey, message, signature);
}
