import type { AgentConfig } from '@spike/0g-client';
import { kyberEncrypt } from '@spike/pqc';
import { uploadBytes } from '@spike/0g-client';
import type { ethers } from 'ethers';
import type { StorageRef } from '@spike/0g-client';

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
