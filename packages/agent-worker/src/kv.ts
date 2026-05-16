export type AgentConfig = {
  riskLevel: 'conservative' | 'balanced' | 'aggressive';
  assets: string[];
  targetApy: number;
  maxDrawdown: number;
  rebalanceFrequency: 'daily' | 'weekly' | 'on-drift';
  qrngSeedingEnabled: boolean;
  driftThreshold: number;
};

export type PendingAction = {
  id: string;
  actionHash: string;
  txHash: string;
  success: boolean;
  pnlBps: number;
  timestamp: string;
  recorded: boolean;
};

export type AgentState = {
  status: 'active' | 'paused';
  config: AgentConfig;
  lastAction?: string;
  lastWeights?: Record<string, number>;
  lastSharpe?: number;
  pendingActions: PendingAction[];
};

export type AuditEntry = {
  agentId: number;
  timestamp: number;
  actionType: string;
  attested: boolean;
  details?: Record<string, unknown>;
};

const AGENT_KEY = (id: number) => `agent:${id}`;
const IDS_KEY = 'agent:ids';
const PRICE_KEY = (id: number) => `pricewindow:${id}`;
const AUDIT_PREFIX = (id: number) => `audit:${id}:`;

export async function loadAgent(kv: KVNamespace, id: number): Promise<AgentState | null> {
  const raw = await kv.get(AGENT_KEY(id));
  return raw ? JSON.parse(raw) as AgentState : null;
}

export async function saveAgent(kv: KVNamespace, id: number, state: AgentState): Promise<void> {
  await kv.put(AGENT_KEY(id), JSON.stringify(state));
}

export async function loadAllIds(kv: KVNamespace): Promise<number[]> {
  const raw = await kv.get(IDS_KEY);
  return raw ? JSON.parse(raw) as number[] : [];
}

export async function registerAgentId(kv: KVNamespace, id: number): Promise<void> {
  const ids = await loadAllIds(kv);
  if (!ids.includes(id)) {
    ids.push(id);
    await kv.put(IDS_KEY, JSON.stringify(ids));
  }
}

export async function loadPriceWindow(kv: KVNamespace, id: number): Promise<Record<string, number[]>> {
  const raw = await kv.get(PRICE_KEY(id));
  return raw ? JSON.parse(raw) as Record<string, number[]> : {};
}

export async function savePriceWindow(kv: KVNamespace, id: number, window: Record<string, number[]>): Promise<void> {
  await kv.put(PRICE_KEY(id), JSON.stringify(window), { expirationTtl: 86400 });
}

export async function appendAudit(kv: KVNamespace, entry: AuditEntry): Promise<void> {
  const key = `${AUDIT_PREFIX(entry.agentId)}${entry.timestamp}`;
  await kv.put(key, JSON.stringify(entry), { expirationTtl: 30 * 86400 }); // 30 days
}

export async function getAuditLog(kv: KVNamespace, agentId: number, limit = 20): Promise<AuditEntry[]> {
  const prefix = AUDIT_PREFIX(agentId);
  const list = await kv.list({ prefix, limit });
  const entries = await Promise.all(
    list.keys.map(async k => {
      const raw = await kv.get(k.name);
      return raw ? JSON.parse(raw) as AuditEntry : null;
    })
  );
  return (entries.filter(Boolean) as AuditEntry[])
    .sort((a, b) => b.timestamp - a.timestamp);
}
