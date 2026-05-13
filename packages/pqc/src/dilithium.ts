import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { encodeAbiParameters, hexToBytes } from 'viem';
import type { DilithiumKeypair, SignResult, ActionEnvelope } from './types.js';
import { keccak256Fingerprint } from './utils.js';

export function generateDilithiumKeypair(): DilithiumKeypair {
  const seed = crypto.getRandomValues(new Uint8Array(32));
  const { secretKey, publicKey } = ml_dsa65.keygen(seed);
  return { publicKey, secretKey, fingerprint: keccak256Fingerprint(publicKey) };
}

export function dilithiumSign(secretKey: Uint8Array, message: Uint8Array): SignResult {
  // v0.6.x API: sign(message, secretKey)
  const signature = ml_dsa65.sign(message, secretKey);
  return { signature, message };
}

export function dilithiumVerify(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array
): boolean {
  // v0.6.x API: verify(signature, message, publicKey)
  return ml_dsa65.verify(signature, message, publicKey);
}

/**
 * Encodes a structured action envelope as ABI-packed bytes.
 * Includes chainId + contractAddress + nonce + actionHash + actionType
 * to prevent cross-chain, cross-contract, and replay attacks.
 */
export function buildActionEnvelope(envelope: ActionEnvelope): Uint8Array {
  const encoded = encodeAbiParameters(
    [
      { name: 'chainId', type: 'uint256' },
      { name: 'contractAddress', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'actionHash', type: 'bytes32' },
      { name: 'actionType', type: 'string' },
    ],
    [envelope.chainId, envelope.contractAddress, envelope.nonce, envelope.actionHash, envelope.actionType]
  );
  return hexToBytes(encoded);
}

/** Signs an action using a replay-safe structured envelope. */
export function signAction(secretKey: Uint8Array, envelope: ActionEnvelope): SignResult {
  const message = buildActionEnvelope(envelope);
  return dilithiumSign(secretKey, message);
}
