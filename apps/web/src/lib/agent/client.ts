const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL ?? 'http://localhost:3001';

export async function getAgentStatus(agentId: number) {
  const res = await fetch(`${AGENT_URL}/api/agent/status/${agentId}`);
  if (!res.ok) throw new Error('Failed to fetch agent status');
  return res.json();
}

export async function pauseAgent(agentId: number) {
  const res = await fetch(`${AGENT_URL}/api/agent/pause/${agentId}`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to pause agent');
  return res.json();
}

export async function resumeAgent(agentId: number) {
  const res = await fetch(`${AGENT_URL}/api/agent/resume/${agentId}`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to resume agent');
  return res.json();
}
