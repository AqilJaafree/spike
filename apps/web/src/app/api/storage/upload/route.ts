import { NextRequest, NextResponse } from 'next/server';
import { Wallet } from 'ethers';
import { uploadAgentConfig } from '@spike/0g-client';
import type { AgentConfig } from '@spike/0g-client';

// POST /api/storage/upload
// Accepts an AgentConfig JSON body and uploads it to 0G Storage using a
// server-side signer (STORAGE_PRIVATE_KEY). Returns { rootHash }.
//
// The browser can't call the 0G storage Node.js SDK directly — it uses
// Node.js-only APIs (Buffer, crypto, P2P networking). This route proxies it.
export async function POST(req: NextRequest) {
  const pk = process.env.STORAGE_PRIVATE_KEY;
  if (!pk) {
    return NextResponse.json(
      { error: 'STORAGE_PRIVATE_KEY not configured' },
      { status: 503 },
    );
  }

  let config: AgentConfig;
  try {
    config = await req.json() as AgentConfig;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const signer = new Wallet(pk);
    const ref = await uploadAgentConfig(config, signer);
    return NextResponse.json({ rootHash: ref.rootHash });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
