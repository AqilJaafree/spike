import { NextRequest } from 'next/server';
import { ethers } from 'ethers';

const TEE_VERIFIER_ABI = [
  'function registerVerification(bytes32 publicKeyFingerprint, bytes32 messageHash, bytes32 sigFingerprint, string calldata attestationId) external',
  'function isVerified(bytes32 publicKeyFingerprint, bytes32 messageHash, bytes32 sigFingerprint) external view returns (bool)',
];

export async function POST(req: NextRequest) {
  const pk = process.env.STORAGE_PRIVATE_KEY;
  const verifierAddr = process.env.NEXT_PUBLIC_TEE_VERIFIER;

  if (!pk || !verifierAddr) {
    return Response.json({ error: 'Attestor not configured' }, { status: 503 });
  }

  const { pubkeyFp, configRoot, sigFingerprint } = await req.json() as {
    pubkeyFp: string;
    configRoot: string;
    sigFingerprint: string;
  };

  if (!pubkeyFp || !configRoot || !sigFingerprint) {
    return Response.json({ error: 'Missing pubkeyFp, configRoot, or sigFingerprint' }, { status: 400 });
  }

  const provider = new ethers.JsonRpcProvider('https://evmrpc-testnet.0g.ai');
  const signer = new ethers.Wallet(pk, provider);
  const contract = new ethers.Contract(verifierAddr, TEE_VERIFIER_ABI, signer);

  try {
    const already = await contract.isVerified(pubkeyFp, configRoot, sigFingerprint);
    if (already) return Response.json({ success: true, already: true });

    const tx = await contract.registerVerification(pubkeyFp, configRoot, sigFingerprint, 'spike-tee-demo');
    await tx.wait();
    return Response.json({ success: true, txHash: tx.hash });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
