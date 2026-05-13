import { uploadBytes, downloadBytes } from './storage/client.js';
import type { Signer } from 'ethers';

const SKILLS_PREFIX = 'spike:skill:';

// In-memory cache for fetched skill content
const _cache = new Map<string, string>();

/**
 * Upload a skill markdown file to 0G Storage.
 * Returns the storage root hash (0x-prefixed hex string) to register in SkillRegistry.
 */
export async function uploadSkill(content: string, signer: Signer): Promise<string> {
  const encoded = new TextEncoder().encode(content);
  const ref = await uploadBytes(encoded, signer);
  return ref.rootHash;
}

/**
 * Fetch a skill markdown file from 0G Storage by its root hash.
 * Caches the result in memory to avoid repeated network calls.
 */
export async function fetchSkill(storageHash: string): Promise<string> {
  const cached = _cache.get(storageHash);
  if (cached) return cached;

  const bytes = await downloadBytes(storageHash);
  const content = new TextDecoder().decode(bytes);
  _cache.set(storageHash, content);
  return content;
}

/**
 * Parse the YAML frontmatter from a skill markdown string.
 * Returns the frontmatter fields as a plain object, or null if none found.
 */
export function parseSkillFrontmatter(markdown: string): Record<string, unknown> | null {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  // Minimal YAML parser: key: value lines only (no nested objects)
  const result: Record<string, unknown> = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx < 0) continue;
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim();
    if (key && val) result[key] = val.replace(/^["']|["']$/g, '');
  }
  return result;
}

/**
 * Compute the on-chain skillKey for a given skill id.
 * Matches: keccak256(abi.encodePacked(id)) in SkillRegistry.sol
 */
export async function computeSkillKey(id: string): Promise<string> {
  const { keccak256, toUtf8Bytes } = await import('ethers');
  return keccak256(toUtf8Bytes(id));
}

export type SkillMeta = {
  id:          string;
  name:        string;
  category:    string;
  version:     string;
  storageHash: string;
};
