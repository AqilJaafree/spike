'use client';

import { generateDilithiumKeypair, generateKyberKeypair, deriveWalletSeed, kyberEncrypt } from '@spike/pqc';
import type { DilithiumKeypair, KyberKeypair } from '@spike/pqc';

export interface PQCKeyBundle {
  dilithium: DilithiumKeypair;
  kyber: KyberKeypair;
}

export async function generateAndEncryptKeys(
  walletSignedNonce: Uint8Array
): Promise<{ bundle: PQCKeyBundle; encryptedBundle: ArrayBuffer; iv: Uint8Array; encapsulatedKey: Uint8Array }> {
  const seed = await deriveWalletSeed(walletSignedNonce);

  const [dilithium, kyber] = await Promise.all([
    generateDilithiumKeypair(),
    generateKyberKeypair(),
  ]);

  const bundle: PQCKeyBundle = { dilithium, kyber };

  // Kyber-encrypt the private key bundle using its own public key (self-encryption)
  const plaintext = new TextEncoder().encode(JSON.stringify({
    dilithiumSecretKey: Array.from(dilithium.secretKey),
    kyberSecretKey: Array.from(kyber.secretKey),
  }));

  const { ciphertext, encapsulatedKey, iv } = await kyberEncrypt(kyber.publicKey, plaintext);

  return {
    bundle,
    encryptedBundle: ciphertext.buffer as ArrayBuffer,
    iv,
    encapsulatedKey,
  };
}
