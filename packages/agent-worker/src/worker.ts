import { z } from 'zod';
import {
  loadAgent, saveAgent, loadAllIds, registerAgentId,
  appendAudit, getAuditLog,
  type AgentState,
} from './kv.js';
import { runAllActiveAgents, runCycle, type CycleResult } from './scheduler.js';

export interface Env {
  AGENTS: KVNamespace;
  AGENT_API_KEY?: string;
  QUANTUM_URL?: string;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

function unauthorized(env: Env, req: Request): Response | null {
  if (!env.AGENT_API_KEY) return null;
  if (req.headers.get('x-agent-api-key') !== env.AGENT_API_KEY) {
    return json({ error: 'Unauthorized' }, 401);
  }
  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, x-agent-api-key',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    },
  });
}

function uuid(): string {
  return crypto.randomUUID();
}

function pathParam(pathname: string, pattern: string): string | null {
  const patParts = pattern.split('/');
  const urlParts = pathname.split('/');
  if (patParts.length !== urlParts.length) return null;
  for (let i = 0; i < patParts.length; i++) {
    if (!patParts[i].startsWith(':') && patParts[i] !== urlParts[i]) return null;
  }
  const idx = patParts.findIndex(p => p.startsWith(':'));
  return idx >= 0 ? urlParts[idx] : null;
}

// ── Zod schemas ───────────────────────────────────────────────────────────────

const ConfigSchema = z.object({
  riskLevel: z.enum(['conservative', 'balanced', 'aggressive']),
  assets: z.array(z.string()).min(2).max(10),
  targetApy: z.number(),
  maxDrawdown: z.number(),
  rebalanceFrequency: z.enum(['daily', 'weekly', 'on-drift']),
  qrngSeedingEnabled: z.boolean(),
  driftThreshold: z.number(),
});

const RegisterSchema = z.object({
  agentId: z.number(),
  config: ConfigSchema,
  dilithiumSk: z.string().optional(),
});

const UpdateConfigSchema = z.object({
  config: ConfigSchema,
  dilithiumSk: z.string().optional(),
});

const ActionSchema = z.object({
  actionHash: z.string(),
  txHash: z.string(),
  success: z.boolean(),
  pnlBps: z.number(),
});

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleHealth(env: Env): Promise<Response> {
  const ids = await loadAllIds(env.AGENTS);
  return json({ status: 'ok', agents: ids.length });
}

async function handleStatus(env: Env, agentId: number): Promise<Response> {
  const agent = await loadAgent(env.AGENTS, agentId);
  if (!agent) return json({ error: 'Agent not found' }, 404);
  return json(agent);
}

async function handlePause(env: Env, req: Request, agentId: number): Promise<Response> {
  const deny = unauthorized(env, req);
  if (deny) return deny;
  const agent = await loadAgent(env.AGENTS, agentId);
  if (!agent) return json({ error: 'Agent not found' }, 404);
  agent.status = 'paused';
  agent.lastAction = new Date().toISOString();
  await saveAgent(env.AGENTS, agentId, agent);
  await appendAudit(env.AGENTS, { agentId, timestamp: Date.now(), actionType: 'pause', attested: false });
  return json({ success: true });
}

async function handleResume(env: Env, req: Request, agentId: number): Promise<Response> {
  const deny = unauthorized(env, req);
  if (deny) return deny;
  const agent = await loadAgent(env.AGENTS, agentId);
  if (!agent) return json({ error: 'Agent not found' }, 404);
  agent.status = 'active';
  agent.lastAction = new Date().toISOString();
  await saveAgent(env.AGENTS, agentId, agent);
  await appendAudit(env.AGENTS, { agentId, timestamp: Date.now(), actionType: 'resume', attested: false });
  return json({ success: true });
}

async function handleRegister(env: Env, req: Request): Promise<Response> {
  const deny = unauthorized(env, req);
  if (deny) return deny;
  const body = await req.json().catch(() => null);
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
  const { agentId, config } = parsed.data;
  const n = config.assets.length;
  const state: AgentState = {
    status: 'active',
    config,
    lastAction: new Date().toISOString(),
    lastWeights: Object.fromEntries(config.assets.map(a => [a, 1 / n])),
    pendingActions: [],
  };
  await saveAgent(env.AGENTS, agentId, state);
  await registerAgentId(env.AGENTS, agentId);
  await appendAudit(env.AGENTS, {
    agentId, timestamp: Date.now(), actionType: 'deploy', attested: false,
    details: { assets: config.assets, riskLevel: config.riskLevel },
  });
  // Run first cycle immediately
  try {
    const result = await runCycle(env.AGENTS, agentId, config, state.lastWeights!, env.QUANTUM_URL);
    if (result.rebalanced) await applyRebalance(env.AGENTS, agentId, state, result);
  } catch { /* non-critical */ }
  return json({ success: true, agentId });
}

async function handleUpdateConfig(env: Env, req: Request, agentId: number): Promise<Response> {
  const deny = unauthorized(env, req);
  if (deny) return deny;
  const agent = await loadAgent(env.AGENTS, agentId);
  if (!agent) return json({ error: 'Agent not found' }, 404);
  const body = await req.json().catch(() => null);
  const parsed = UpdateConfigSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
  agent.config = parsed.data.config;
  agent.lastAction = new Date().toISOString();
  await saveAgent(env.AGENTS, agentId, agent);
  await appendAudit(env.AGENTS, {
    agentId, timestamp: Date.now(), actionType: 'config-update', attested: false,
    details: { riskLevel: parsed.data.config.riskLevel, assets: parsed.data.config.assets },
  });
  return json({ success: true });
}

async function handleAudit(env: Env, agentId: number): Promise<Response> {
  const entries = await getAuditLog(env.AGENTS, agentId, 20);
  return json(entries);
}

async function handlePostAction(env: Env, req: Request, agentId: number): Promise<Response> {
  const deny = unauthorized(env, req);
  if (deny) return deny;
  const agent = await loadAgent(env.AGENTS, agentId);
  if (!agent) return json({ error: 'Agent not found' }, 404);
  const body = await req.json().catch(() => null);
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
  const action = { id: uuid(), ...parsed.data, timestamp: new Date().toISOString(), recorded: false };
  agent.pendingActions.push(action);
  agent.lastAction = action.timestamp;
  await saveAgent(env.AGENTS, agentId, agent);
  return json({ success: true, action });
}

async function handleGetActions(env: Env, agentId: number): Promise<Response> {
  const agent = await loadAgent(env.AGENTS, agentId);
  if (!agent) return json({ error: 'Agent not found' }, 404);
  return json(agent.pendingActions.filter(a => !a.recorded));
}

async function handleAckAction(env: Env, req: Request, agentId: number): Promise<Response> {
  const deny = unauthorized(env, req);
  if (deny) return deny;
  const agent = await loadAgent(env.AGENTS, agentId);
  if (!agent) return json({ error: 'Agent not found' }, 404);
  const body = await req.json().catch(() => null) as { actionId?: string };
  const action = agent.pendingActions.find(a => a.id === body?.actionId);
  if (!action) return json({ error: 'Action not found' }, 404);
  action.recorded = true;
  await saveAgent(env.AGENTS, agentId, agent);
  return json({ success: true });
}

// ── Rebalance callback (cron + immediate) ─────────────────────────────────────

async function applyRebalance(
  kv: KVNamespace,
  agentId: number,
  state: AgentState,
  result: CycleResult,
): Promise<void> {
  state.lastWeights = result.weights;
  state.lastSharpe = result.sharpe;
  state.lastAction = new Date().toISOString();
  state.pendingActions.push({
    id: uuid(),
    actionHash: result.actionHash,
    txHash: `0x${'0'.repeat(64)}`,
    success: result.pnlBps >= 0,
    pnlBps: result.pnlBps,
    timestamp: new Date().toISOString(),
    recorded: true,
  });
  await saveAgent(kv, agentId, state);
  await appendAudit(kv, {
    agentId,
    timestamp: Date.now(),
    actionType: 'rebalance',
    attested: false,
    details: { sharpe: result.sharpe, pnlBps: result.pnlBps, trades: result.trades.length },
  });
}

// ── Router ────────────────────────────────────────────────────────────────────

function agentId(s: string | null): number | null {
  if (!s) return null;
  const n = parseInt(s);
  return isNaN(n) ? null : n;
}

async function handleFetch(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const p = url.pathname.replace(/^\/api\/agent/, '');
  const method = req.method;

  if (method === 'OPTIONS') return json({});

  if (method === 'GET'  && p === '/health')          return handleHealth(env);

  const statusId = agentId(pathParam(p, '/status/:id'));
  if (method === 'GET'  && statusId !== null)         return handleStatus(env, statusId);

  const pauseId = agentId(pathParam(p, '/pause/:id'));
  if (method === 'POST' && pauseId !== null)          return handlePause(env, req, pauseId);

  const resumeId = agentId(pathParam(p, '/resume/:id'));
  if (method === 'POST' && resumeId !== null)         return handleResume(env, req, resumeId);

  if (method === 'POST' && p === '/register')         return handleRegister(env, req);

  const configId = agentId(pathParam(p, '/config/:id'));
  if (method === 'PATCH' && configId !== null)        return handleUpdateConfig(env, req, configId);

  const auditId = agentId(pathParam(p, '/audit/:id'));
  if (method === 'GET'  && auditId !== null)          return handleAudit(env, auditId);

  const ackId = agentId(pathParam(p, '/action/:id/ack'));
  if (method === 'POST' && ackId !== null)            return handleAckAction(env, req, ackId);

  const actionPostId = agentId(pathParam(p, '/action/:id'));
  if (method === 'POST' && actionPostId !== null)     return handlePostAction(env, req, actionPostId);

  const actionsGetId = agentId(pathParam(p, '/actions/:id'));
  if (method === 'GET'  && actionsGetId !== null)     return handleGetActions(env, actionsGetId);

  return json({ error: 'Not found' }, 404);
}

// ── Cron handler (fires every 2 minutes) ──────────────────────────────────────

async function handleScheduled(env: Env): Promise<void> {
  const ids = await loadAllIds(env.AGENTS);
  await runAllActiveAgents(env.AGENTS, ids, env.QUANTUM_URL, async (agentId, state, result) => {
    await applyRebalance(env.AGENTS, agentId, state, result);
  });
}

// ── Export ────────────────────────────────────────────────────────────────────

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await handleFetch(req, env);
    } catch (err) {
      console.error(err);
      return json({ error: 'Internal server error' }, 500);
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleScheduled(env));
  },
};
