import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { zgTestnet } from '@/lib/wagmi/config';
import { AGENT_NFT_ADDRESS, AGENT_NFT_ABI, AGENT_REGISTRY_ADDRESS, AGENT_REGISTRY_ABI } from '@/lib/contracts';

// GET /api/nft/[tokenId]
// Serves ERC-721 metadata JSON so block explorers that can't handle data: URIs
// (like chainscan-galileo) can still display Spike Agent NFTs.
// The AgentNFT contract must have baseURI set to "<appUrl>/api/nft/" for this
// to be called — run `setBaseURI` after deployment via the deploy script.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tokenId: string }> },
) {
  const { tokenId: tokenIdStr } = await params;
  const tokenId = BigInt(tokenIdStr);

  if (!AGENT_NFT_ADDRESS) {
    return NextResponse.json({ error: 'AGENT_NFT contract not configured' }, { status: 503 });
  }

  const client = createPublicClient({
    chain: zgTestnet,
    transport: http('https://evmrpc-testnet.0g.ai', { retryCount: 3 }),
  });

  try {
    const [meta, score] = await Promise.all([
      client.readContract({
        address: AGENT_NFT_ADDRESS,
        abi: AGENT_NFT_ABI,
        functionName: 'getAgentMeta',
        args: [tokenId],
      }) as Promise<{
        dilithiumFingerprint: `0x${string}`;
        configRoot: `0x${string}`;
        actionSigFingerprint: `0x${string}`;
        skillKey: `0x${string}`;
        mintedAt: bigint;
      }>,
      AGENT_REGISTRY_ADDRESS
        ? (client.readContract({
            address: AGENT_REGISTRY_ADDRESS,
            abi: AGENT_REGISTRY_ABI,
            functionName: 'getPerformanceScore',
            args: [tokenId],
          }) as Promise<{
            totalActions: bigint;
            successCount: bigint;
            pnlBasisPoints: bigint;
            lastUpdatedAt: bigint;
          }>).catch(() => null)
        : Promise.resolve(null),
    ]);

    const attributes: Array<{ trait_type: string; value: string | number }> = [
      { trait_type: 'skillKey',              value: meta.skillKey },
      { trait_type: 'dilithiumFingerprint',  value: meta.dilithiumFingerprint },
      { trait_type: 'configRoot',            value: meta.configRoot },
      { trait_type: 'actionSigFingerprint',  value: meta.actionSigFingerprint },
      { trait_type: 'mintedAt',              value: Number(meta.mintedAt) },
    ];

    if (score) {
      attributes.push(
        { trait_type: 'totalActions',   value: Number(score.totalActions) },
        { trait_type: 'successCount',   value: Number(score.successCount) },
        { trait_type: 'pnlBasisPoints', value: Number(score.pnlBasisPoints) },
        { trait_type: 'scoreUpdatedAt', value: Number(score.lastUpdatedAt) },
      );
    }

    return NextResponse.json(
      {
        name: `Spike Agent #${tokenIdStr}`,
        description: 'Quantum-safe DeFi agent on 0G Network',
        attributes,
      },
      { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 404 });
  }
}
