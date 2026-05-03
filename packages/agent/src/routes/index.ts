import { Router, type Router as ExpressRouter } from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { z } from 'zod';

type AgentState = { status: 'active' | 'paused'; config: unknown; lastAction?: string };

// JSON file-backed persistence — survives process restarts
const STATE_FILE = process.env.AGENT_STATE_FILE ?? './agents.json';

function loadAgents(): Map<number, AgentState> {
  if (!existsSync(STATE_FILE)) return new Map();
  try {
    const obj = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as Record<string, AgentState>;
    return new Map(Object.entries(obj).map(([k, v]) => [Number(k), v]));
  } catch {
    return new Map();
  }
}

function persist(agents: Map<number, AgentState>): void {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(Object.fromEntries(agents.entries()), null, 2));
  } catch { /* non-critical — state stays in memory */ }
}

const agents = loadAgents();

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
  agent.status = 'paused';
  agent.lastAction = new Date().toISOString();
  persist(agents);
  res.json({ success: true });
});

router.post('/resume/:agentId', (req, res) => {
  const id = parseInt(req.params.agentId);
  const agent = agents.get(id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  agent.status = 'active';
  agent.lastAction = new Date().toISOString();
  persist(agents);
  res.json({ success: true });
});

const RegisterSchema = z.object({
  agentId: z.number(),
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
  const { agentId, config } = parsed.data;
  agents.set(agentId, { status: 'active', config, lastAction: new Date().toISOString() });
  persist(agents);
  res.json({ success: true, agentId });
});
