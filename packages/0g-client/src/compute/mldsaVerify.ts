import OpenAI from 'openai';
import type { Signer } from 'ethers';
import type { TeeVerifyResult } from '../types.js';

/**
 * Provider address of a 0G Compute TeeML service that runs ML-DSA verification.
 * The service accepts { publicKeyHex, messageHex, signatureHex } and returns
 * { verified: boolean } — signed by the TEE enclave key.
 */
const MLDSA_VERIFY_PROVIDER = process.env.ZG_MLDSA_VERIFY_PROVIDER ?? '';

/**
 * Submits an ML-DSA-65 signature verification request to a 0G Compute TeeML provider.
 *
 * The TeeML provider runs inside an Intel TDX TEE, signs the response with its
 * enclave key, and returns a verifiable attestation. Call
 * `broker.inference.processResponse(provider, attestationId, reply)` to validate
 * the TEE signature before trusting the result.
 *
 * After successful verification, call TeeAttestationVerifier.registerVerification
 * on-chain with the returned attestationId to make the result queryable by AgentRegistry.
 *
 * @param signer      ethers Signer (pays 0G Compute fees)
 * @param publicKey   ML-DSA-65 public key (raw bytes, 1952 bytes)
 * @param message     Message that was signed (raw bytes)
 * @param signature   ML-DSA-65 signature (raw bytes, 3309 bytes)
 * @returns           TEE-attested verification result, or null if provider unavailable
 */
export async function submitMlDsaVerifyToTee(
  signer: Signer,
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array
): Promise<TeeVerifyResult | null> {
  if (!MLDSA_VERIFY_PROVIDER) return null;

  try {
    const { createZGComputeNetworkBroker } = await import('@0glabs/0g-serving-broker');
    const broker = await createZGComputeNetworkBroker(signer as any);
    const { endpoint, model } = await broker.inference.getServiceMetadata(MLDSA_VERIFY_PROVIDER);

    const requestPayload = JSON.stringify({
      type: 'ml-dsa-verify',
      publicKeyHex: Buffer.from(publicKey).toString('hex'),
      messageHex: Buffer.from(message).toString('hex'),
      signatureHex: Buffer.from(signature).toString('hex'),
    });

    const headers = await broker.inference.getRequestHeaders(MLDSA_VERIFY_PROVIDER, requestPayload);
    const openai = new OpenAI({ baseURL: endpoint, apiKey: '' });

    const response = await openai.chat.completions.create(
      { model, messages: [{ role: 'user', content: requestPayload }] },
      { headers } as any
    );

    const reply = response.choices[0].message.content?.trim() ?? '{}';
    // The attestationId is the chatID used by processResponse for TEE sig validation
    const attestationId = response.id;

    // Validate the TEE signature on the response
    await broker.inference.processResponse(MLDSA_VERIFY_PROVIDER, attestationId, reply);

    let parsed: { verified?: boolean } = {};
    try {
      parsed = JSON.parse(reply);
    } catch {
      return null;
    }

    return {
      verified: parsed.verified === true,
      attestationId,
      provider: MLDSA_VERIFY_PROVIDER,
    };
  } catch {
    return null;
  }
}

/**
 * Returns whether 0G Compute ML-DSA verification is configured.
 * When false, fall back to local off-chain verification.
 */
export function isTeeVerifyAvailable(): boolean {
  return MLDSA_VERIFY_PROVIDER.length > 0;
}
