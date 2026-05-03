import { Router } from 'express';
import { z } from 'zod';

// In-memory agent state store — replace with 0G KV in production
const agents = new Map<number, { status: 'active' | 'paused'; config: unknown; lastAction?: string }>();

export const router = Router();

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
  res.json({ success: true });
});

router.post('/resume/:agentId', (req, res) => {
  const id = parseInt(req.params.agentId);
  const agent = agents.get(id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  agent.status = 'active';
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
  agents.set(agentId, { status: 'active', config });
  res.json({ success: true, agentId });
});
