import { ZgFile, Indexer, MemData, KvClient, Batcher } from '@0gfoundation/0g-storage-ts-sdk';
import type { ethers } from 'ethers';
import type { StorageRef, AgentConfig, QPUResult, AuditEntry } from '../types.js';

const INDEXER_URL = process.env.ZG_INDEXER_URL ?? 'https://indexer-storage-turbo.0g.ai';
const RPC_URL = process.env.ZG_RPC_URL ?? 'https://evmrpc-testnet.0g.ai';
const KV_URL = process.env.ZG_KV_URL ?? 'https://indexer-storage-turbo.0g.ai';

// KV key namespaces
const NS_QPU_CACHE = 'spike:qpu:';
const NS_AUDIT = 'spike:audit:';
const QPU_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function uploadBytes(
  data: Uint8Array,
  signer: ethers.Signer
): Promise<StorageRef> {
  const mem = new MemData(Buffer.from(data));
  const indexer = new Indexer(INDEXER_URL);
  const [tx, err] = await indexer.upload(mem, RPC_URL, signer, { tags: '0x' });
  if (err) throw new Error(`0G upload failed: ${err}`);
  return { rootHash: tx, uploadedAt: Date.now() };
}

export async function downloadBytes(rootHash: string): Promise<Uint8Array> {
  const indexer = new Indexer(INDEXER_URL);
  const blob = await indexer.downloadToBlob(rootHash);
  return new Uint8Array(await blob.arrayBuffer());
}

export async function uploadAgentConfig(
  config: AgentConfig,
  signer: ethers.Signer
): Promise<StorageRef> {
  const encoded = new TextEncoder().encode(JSON.stringify(config));
  return uploadBytes(encoded, signer);
}

export async function downloadAgentConfig(rootHash: string): Promise<AgentConfig> {
  const bytes = await downloadBytes(rootHash);
  return JSON.parse(new TextDecoder().decode(bytes)) as AgentConfig;
}

export async function storeQPUCache(
  portfolioHash: string,
  result: QPUResult
): Promise<void> {
  const kv = new KvClient(KV_URL);
  const key = Buffer.from(`${NS_QPU_CACHE}${portfolioHash}`);
  const value = Buffer.from(JSON.stringify(result));
  // KvClient batcher write
  const batcher = kv.newBatcher();
  batcher.set(key, value);
  await batcher.exec();
}

export async function getQPUCache(portfolioHash: string): Promise<QPUResult | null> {
  const kv = new KvClient(KV_URL);
  const key = Buffer.from(`${NS_QPU_CACHE}${portfolioHash}`);
  const value = await kv.getValue(key);
  if (!value) return null;

  const result: QPUResult = JSON.parse(value.toString());
  if (Date.now() - result.cachedAt > QPU_CACHE_TTL_MS) return null; // expired
  return result;
}

export async function appendAuditLog(entry: AuditEntry): Promise<void> {
  const kv = new KvClient(KV_URL);
  const key = Buffer.from(`${NS_AUDIT}${entry.agentId}:${entry.timestamp}`);
  const value = Buffer.from(JSON.stringify(entry));
  const batcher = kv.newBatcher();
  batcher.set(key, value);
  await batcher.exec();
}
