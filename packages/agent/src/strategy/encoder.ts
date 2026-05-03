import type { AgentConfig, StorageRef } from '@spike/0g-client';
import { kyberEncrypt, kyberDecrypt } from '@spike/pqc';
import { uploadBytes, downloadBytes } from '@spike/0g-client';
import type { ethers } from 'ethers';

export async function encryptAndStoreConfig(
  config: AgentConfig,
  kyberPublicKey: Uint8Array,
  signer: ethers.Signer
): Promise<{ storageRef: StorageRef; configRoot: string }> {
  const plaintext = new TextEncoder().encode(JSON.stringify(config));
  const { ciphertext, encapsulatedKey, iv } = await kyberEncrypt(kyberPublicKey, plaintext);

  // Bundle: [4 bytes iv length][iv][4 bytes kem length][encapsulatedKey][ciphertext]
  const bundle = new Uint8Array(4 + iv.length + 4 + encapsulatedKey.length + ciphertext.length);
  const view = new DataView(bundle.buffer);
  let offset = 0;
  view.setUint32(offset, iv.length);
  offset += 4;
  bundle.set(iv, offset);
  offset += iv.length;
  view.setUint32(offset, encapsulatedKey.length);
  offset += 4;
  bundle.set(encapsulatedKey, offset);
  offset += encapsulatedKey.length;
  bundle.set(ciphertext, offset);

  const storageRef = await uploadBytes(bundle, signer);
  return { storageRef, configRoot: storageRef.rootHash };
}

/**
 * Downloads an encrypted config bundle from 0G Storage and decrypts it with
 * the Kyber-1024 private key. Mirrors encryptAndStoreConfig — same wire format.
 */
export async function downloadAndDecryptConfig(
  rootHash: string,
  kyberPrivateKey: Uint8Array
): Promise<AgentConfig> {
  const bundle = await downloadBytes(rootHash);
  const view = new DataView(bundle.buffer, bundle.byteOffset, bundle.byteLength);
  let offset = 0;

  const ivLen = view.getUint32(offset); offset += 4;
  const iv = bundle.slice(offset, offset + ivLen); offset += ivLen;

  const kemLen = view.getUint32(offset); offset += 4;
  const encapsulatedKey = bundle.slice(offset, offset + kemLen); offset += kemLen;

  const ciphertext = bundle.slice(offset);

  const plaintext = await kyberDecrypt(kyberPrivateKey, encapsulatedKey, ciphertext, iv);
  return JSON.parse(new TextDecoder().decode(plaintext)) as AgentConfig;
}
