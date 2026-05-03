import type { DilithiumKeypair, SignResult } from './types.js';
import { keccak256Fingerprint } from './utils.js';

// Algorithm: Dilithium3 (NIST FIPS 204 — ML-DSA-65)
const ALG = 'Dilithium3';

async function getOQS() {
  // liboqs-js ships as a WASM module — dynamic import keeps it tree-shakeable
  const { OQS } = await import('liboqs-js');
  return OQS;
}

export async function generateDilithiumKeypair(): Promise<DilithiumKeypair> {
  const OQS = await getOQS();
  const sig = new OQS.Signature(ALG);
  const { publicKey, secretKey } = sig.keypair();
  sig.free();
  return {
    publicKey,
    secretKey,
    fingerprint: keccak256Fingerprint(publicKey),
  };
}

export async function dilithiumSign(
  secretKey: Uint8Array,
  message: Uint8Array
): Promise<SignResult> {
  const OQS = await getOQS();
  const sig = new OQS.Signature(ALG);
  const signature = sig.sign(message, secretKey);
  sig.free();
  return { signature, message };
}

export async function dilithiumVerify(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array
): Promise<boolean> {
  const OQS = await getOQS();
  const sig = new OQS.Signature(ALG);
  const valid = sig.verify(message, signature, publicKey);
  sig.free();
  return valid;
}
