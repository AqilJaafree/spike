import { Router, type Router as ExpressRouter } from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { startAgentLoop, stopAgentLoop, type CycleResult } from '../market/scheduler.js';
import { appendAuditLog, getAuditLog } from '@spike/0g-client';
import type { AuditEntry } from '@spike/0g-client';

export type PendingAction = {
  id: string;
  actionHash: string;
  dilithiumSig?: string; // hex-encoded ML-DSA-65 signature of the action envelope
  txHash: string;
  success: boolean;
  pnlBps: number;
  timestamp: string;
  recorded: boolean;
};

export type AgentConfig = {
  riskLevel: 'conservative' | 'balanced' | 'aggressive';
  assets: string[];
  targetApy: number;
  maxDrawdown: number;
  rebalanceFrequency: 'daily' | 'weekly' | 'on-drift';
  qrngSeedingEnabled: boolean;
  driftThreshold: number;
};

export type AgentState = {
  status: 'active' | 'paused';
  config: AgentConfig;
  dilithiumSk?: string; // hex-encoded ML-DSA-65 secret key for signing each action
  lastAction?: string;
  lastWeights?: Record<string, number>;
  lastSharpe?: number;
  pendingActions: PendingAction[];
};

const STATE_FILE = process.env.AGENT_STATE_FILE ?? './agents.json';

function loadAgents(): Map<number, AgentState> {
  if (!existsSync(STATE_FILE)) return new Map();
  try {
    const obj = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as Record<string, AgentState>;
    return new Map(Object.entries(obj).map(([k, v]) => [Number(k), { ...v, pendingActions: v.pendingActions ?? [] }]));
  } catch {
    return new Map();
  }
}

function persist(): void {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(Object.fromEntries(agents.entries()), null, 2));
  } catch { /* non-critical */ }
}

const agents = loadAgents();

// Scheduler callbacks — shared by register/resume
const schedulerCallbacks = {
  getState: (agentId: number) => {
    const state = agents.get(agentId);
    if (!state || state.status !== 'active') return undefined;
    const n = state.config.assets.length;
    return {
      config: state.config,
      dilithiumSk: state.dilithiumSk,
      currentWeights: state.lastWeights ?? Object.fromEntries(state.config.assets.map(a => [a, 1 / n])),
    };
  },
  onRebalance: (agentId: number, result: CycleResult) => {
    const state = agents.get(agentId);
    if (!state) return;
    state.lastWeights = result.weights;
    state.lastSharpe = result.sharpe;
    state.lastAction = new Date().toISOString();
    state.pendingActions.push({
      id: randomUUID(),
      actionHash: result.actionHash,
      dilithiumSig: result.dilithiumSig,
      txHash: `0x${'0'.repeat(64)}`,
      success: result.pnlBps >= 0,
      pnlBps: result.pnlBps,
      timestamp: new Date().toISOString(),
      recorded: true, // agent confirms its own actions; on-chain recordAction is optional
    });
    persist();
    appendAuditLog({
      agentId,
      timestamp: Date.now(),
      actionType: 'rebalance',
      actionHash: result.actionHash,
      attested: !!result.dilithiumSig,
      details: { sharpe: result.sharpe, pnlBps: result.pnlBps, trades: result.trades.length },
    }).catch(() => null);
  },
};

// Restart loops for agents that were active before server restart
for (const [agentId, state] of agents) {
  if (state.status === 'active') {
    startAgentLoop(agentId, schedulerCallbacks);
  }
}

export const router: ExpressRouter = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', agents: agents.size });
});

router.get('/status/:agentId', (req, res) => {
  const id = parseInt(req.params.agentId);
  const agent = agents.get(id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent);
});

router.post('/pause/:agentId', (req, res) => {
  const id = parseInt(req.params.agentId);
  const agent = agents.get(id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  stopAgentLoop(id);
  agent.status = 'paused';
  agent.lastAction = new Date().toISOString();
  persist();
  appendAuditLog({ agentId: id, timestamp: Date.now(), actionType: 'pause', attested: false }).catch(() => null);
  res.json({ success: true });
});

router.post('/resume/:agentId', (req, res) => {
  const id = parseInt(req.params.agentId);
  const agent = agents.get(id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  agent.status = 'active';
  agent.lastAction = new Date().toISOString();
  persist();
  startAgentLoop(id, schedulerCallbacks);
  appendAuditLog({ agentId: id, timestamp: Date.now(), actionType: 'resume', attested: false }).catch(() => null);
  res.json({ success: true });
});

const RegisterSchema = z.object({
  agentId: z.number(),
  dilithiumSk: z.string().optional(), // hex-encoded ML-DSA-65 secret key
  config: z.object({
    riskLevel: z.enum(['conservative', 'balanced', 'aggressive']),
    assets: z.array(z.string()).min(2).max(10),
    targetApy: z.number(),
    maxDrawdown: z.number(),
    rebalanceFrequency: z.enum(['daily', 'weekly', 'on-drift']),
    qrngSeedingEnabled: z.boolean(),
    driftThreshold: z.number(),
  }),
});

router.post('/register', (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { agentId, config, dilithiumSk } = parsed.data;
  const n = config.assets.length;
  agents.set(agentId, {
    status: 'active',
    config,
    dilithiumSk,
    lastAction: new Date().toISOString(),
    lastWeights: Object.fromEntries(config.assets.map(a => [a, 1 / n])),
    pendingActions: [],
  });
  persist();
  startAgentLoop(agentId, schedulerCallbacks);
  appendAuditLog({ agentId, timestamp: Date.now(), actionType: 'deploy', attested: false, details: { assets: config.assets, riskLevel: config.riskLevel } }).catch(() => null);
  res.json({ success: true, agentId });
});

router.get('/audit/:agentId', async (req, res) => {
  const id = parseInt(req.params.agentId);
  try {
    const entries = await getAuditLog(id, 20);
    res.json(entries);
  } catch {
    res.json([]);
  }
});

const ActionSchema = z.object({
  actionHash: z.string(),
  txHash: z.string(),
  success: z.boolean(),
  pnlBps: z.number(),
});

router.post('/action/:agentId', (req, res) => {
  const id = parseInt(req.params.agentId);
  const agent = agents.get(id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const parsed = ActionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const action: PendingAction = { id: randomUUID(), ...parsed.data, timestamp: new Date().toISOString(), recorded: false };
  agent.pendingActions.push(action);
  agent.lastAction = action.timestamp;
  persist();
  res.json({ success: true, action });
});

router.get('/actions/:agentId', (req, res) => {
  const id = parseInt(req.params.agentId);
  const agent = agents.get(id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent.pendingActions.filter(a => !a.recorded));
});

const AckSchema = z.object({ actionId: z.string() });

router.post('/action/:agentId/ack', (req, res) => {
  const id = parseInt(req.params.agentId);
  const agent = agents.get(id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const parsed = AckSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const action = agent.pendingActions.find(a => a.id === parsed.data.actionId);
  if (!action) return res.status(404).json({ error: 'Action not found' });
  action.recorded = true;
  persist();
  res.json({ success: true });
});
