import type { AgentConfig } from '@spike/0g-client';

const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL ?? 'http://localhost:3001';

function agentHeaders(): HeadersInit {
  const key = process.env.NEXT_PUBLIC_AGENT_API_KEY;
  return key ? { 'Content-Type': 'application/json', 'X-Agent-Api-Key': key } : { 'Content-Type': 'application/json' };
}

export async function getAgentStatus(agentId: number) {
  const res = await fetch(`${AGENT_URL}/api/agent/status/${agentId}`, { headers: agentHeaders() });
  if (!res.ok) throw new Error('Failed to fetch agent status');
  return res.json();
}

export async function pauseAgent(agentId: number) {
  const res = await fetch(`${AGENT_URL}/api/agent/pause/${agentId}`, { method: 'POST', headers: agentHeaders() });
  if (!res.ok) throw new Error('Failed to pause agent');
  return res.json();
}

export async function resumeAgent(agentId: number) {
  const res = await fetch(`${AGENT_URL}/api/agent/resume/${agentId}`, { method: 'POST', headers: agentHeaders() });
  if (!res.ok) throw new Error('Failed to resume agent');
  return res.json();
}

export async function registerAgent(agentId: number, config: Partial<AgentConfig>) {
  const res = await fetch(`${AGENT_URL}/api/agent/register`, {
    method: 'POST',
    headers: agentHeaders(),
    body: JSON.stringify({ agentId, config }),
  });
  if (!res.ok) throw new Error('Failed to register agent');
  return res.json();
}
