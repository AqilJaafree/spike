import { MemData, Indexer, KvClient } from '@0gfoundation/0g-storage-ts-sdk';
import type { Signer } from 'ethers';
import type { StorageRef, AgentConfig, QPUResult, AuditEntry } from '../types.js';

const INDEXER_URL = process.env.ZG_INDEXER_URL ?? 'https://indexer-storage-turbo-testnet.0g.ai';
const RPC_URL = process.env.ZG_RPC_URL ?? 'https://evmrpc-testnet.0g.ai';
const KV_URL = process.env.ZG_KV_URL ?? 'https://indexer-storage-turbo-testnet.0g.ai';

const NS_QPU_CACHE = 'spike:qpu:';
const NS_AUDIT = 'spike:audit:';
const QPU_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// In-memory QPU cache mirrors 0G KV — fallback when KV node is unreachable
const memCache = new Map<string, QPUResult>();

export async function uploadBytes(data: Uint8Array, signer: Signer): Promise<StorageRef> {
  const mem = new MemData(data);
  const indexer = new Indexer(INDEXER_URL);
  // signer cast: 0g-storage-ts-sdk bundles its own ethers CJS build; type-level incompatibility
  const [result, err] = await indexer.upload(mem, RPC_URL, signer as any);
  if (err) throw new Error(`0G upload failed: ${err}`);
  const rootHash = 'rootHash' in result ? result.rootHash : result.rootHashes[0];
  return { rootHash, uploadedAt: Date.now() };
}

export async function downloadBytes(rootHash: string): Promise<Uint8Array> {
  const indexer = new Indexer(INDEXER_URL);
  const [blob, err] = await (indexer as any).downloadToBlob(rootHash) as [Blob, Error | null];
  if (err) throw new Error(`0G download failed: ${err}`);
  return new Uint8Array(await blob.arrayBuffer());
}

export async function uploadAgentConfig(config: AgentConfig, signer: Signer): Promise<StorageRef> {
  const encoded = new TextEncoder().encode(JSON.stringify(config));
  return uploadBytes(encoded, signer);
}

export async function downloadAgentConfig(rootHash: string): Promise<AgentConfig> {
  const bytes = await downloadBytes(rootHash);
  return JSON.parse(new TextDecoder().decode(bytes)) as AgentConfig;
}

export async function storeQPUCache(portfolioHash: string, result: QPUResult): Promise<void> {
  memCache.set(portfolioHash, result);
  // Best-effort persist to 0G KV
  try {
    const kv = new KvClient(KV_URL);
    const streamId = NS_QPU_CACHE + portfolioHash;
    const key = new TextEncoder().encode(portfolioHash);
    const value = new TextEncoder().encode(JSON.stringify(result));
    await (kv as any).set(streamId, key, value);
  } catch { /* KV write is non-critical */ }
}

export async function getQPUCache(portfolioHash: string): Promise<QPUResult | null> {
  // Check in-memory first
  const cached = memCache.get(portfolioHash);
  if (cached) {
    if (Date.now() - cached.cachedAt > QPU_CACHE_TTL_MS) {
      memCache.delete(portfolioHash);
      return null;
    }
    return cached;
  }
  // Fallback: read from 0G KV
  try {
    const kv = new KvClient(KV_URL);
    const streamId = NS_QPU_CACHE + portfolioHash;
    const key = new TextEncoder().encode(portfolioHash);
    const value = await kv.getValue(streamId, key);
    if (!value?.data) return null;
    // value.data is base64-encoded by the 0G KV node
    const result: QPUResult = JSON.parse(Buffer.from(value.data as string, 'base64').toString('utf8'));
    if (Date.now() - result.cachedAt > QPU_CACHE_TTL_MS) return null;
    memCache.set(portfolioHash, result);
    return result;
  } catch {
    return null;
  }
}

export async function appendAuditLog(entry: AuditEntry): Promise<void> {
  // Best-effort write to 0G KV
  try {
    const kv = new KvClient(KV_URL);
    const streamId = NS_AUDIT + entry.agentId;
    const key = new TextEncoder().encode(`${entry.agentId}:${entry.timestamp}`);
    const value = new TextEncoder().encode(JSON.stringify(entry));
    await (kv as any).set(streamId, key, value);
  } catch { /* Audit log is non-critical — agent continues */ }
}
