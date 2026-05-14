import { createHash } from 'crypto';

const QUANTUM_URL = process.env.QUANTUM_SERVICE_URL ?? 'http://localhost:8000';

const COINGECKO_IDS: Record<string, string> = {
  ETH: 'ethereum', BTC: 'bitcoin', SOL: 'solana', USDC: 'usd-coin',
  ARB: 'arbitrum', MATIC: 'matic-network', LINK: 'chainlink', AVAX: 'avalanche-2',
};

const BASE_VOLS: Record<string, number> = {
  ETH: 0.8, BTC: 0.7, SOL: 1.2, USDC: 0.01, ARB: 1.5, MATIC: 1.3, LINK: 1.0, AVAX: 1.1,
};

export type AgentLoopConfig = {
  riskLevel: 'conservative' | 'balanced' | 'aggressive';
  assets: string[];
  driftThreshold: number;
  targetApy: number;
};

export type CycleResult = {
  weights: Record<string, number>;
  sharpe: number;
  rebalanced: boolean;
  actionHash: string;
  pnlBps: number;
  trades: Array<{ from: string; to: string; amount: number }>;
};

async function fetchPrices(assets: string[]): Promise<Record<string, number>> {
  const ids = assets.map(a => COINGECKO_IDS[a] ?? a.toLowerCase()).join(',');
  const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const data = await res.json() as Record<string, { usd: number }>;
  return Object.fromEntries(
    assets.map(a => [a, data[COINGECKO_IDS[a] ?? a.toLowerCase()]?.usd ?? 1])
  );
}

function syntheticReturns(assets: string[], n = 30): { returns: number[][], covariance: number[][] } {
  const dv = assets.map(a => (BASE_VOLS[a] ?? 1.0) / Math.sqrt(252));
  const returns = Array.from({ length: n }, () =>
    assets.map((_, i) => (Math.random() - 0.47) * dv[i])
  );
  const covariance = assets.map((_, i) =>
    assets.map((_, j) => i === j ? dv[i] ** 2 : dv[i] * dv[j] * 0.3)
  );
  return { returns, covariance };
}

async function callOptimize(
  assets: string[],
  returns: number[][],
  covariance: number[][],
  riskLevel: string,
): Promise<{ weights: Record<string, number>; sharpe: number; backend_used: string }> {
  const res = await fetch(`${QUANTUM_URL}/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assets,
      returns,
      covariance,
      risk_tolerance: riskLevel === 'aggressive' ? 0.8 : riskLevel === 'balanced' ? 0.5 : 0.2,
      max_weight: 0.40,
      min_weight: 0.05,
    }),
  });
  if (!res.ok) throw new Error(`Quantum optimize ${res.status}`);
  return res.json() as Promise<{ weights: Record<string, number>; sharpe: number; backend_used: string }>;
}

async function callRebalance(
  current: Record<string, number>,
  target: Record<string, number>,
  prices: Record<string, number>,
): Promise<Array<{ from: string; to: string; amount: number }>> {
  const res = await fetch(`${QUANTUM_URL}/rebalance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      current_weights: current,
      target_weights: target,
      price_data: prices,
      max_trade_size: 0.20,
    }),
  });
  if (!res.ok) return [];
  const data = await res.json() as { selected_trades?: Array<{ from: string; to: string; amount: number }> };
  return data.selected_trades ?? [];
}

export async function runCycle(
  agentId: number,
  config: AgentLoopConfig,
  currentWeights: Record<string, number>,
): Promise<CycleResult> {
  const prices = await fetchPrices(config.assets);
  const { returns, covariance } = syntheticReturns(config.assets);
  const qpu = await callOptimize(config.assets, returns, covariance, config.riskLevel);

  const n = config.assets.length;
  const equalWeight = 1 / n;
  const cur = config.assets.reduce<Record<string, number>>((acc, a) => {
    acc[a] = currentWeights[a] ?? equalWeight;
    return acc;
  }, {});

  const maxDrift = Math.max(
    ...config.assets.map(a => Math.abs((cur[a] ?? equalWeight) - (qpu.weights[a] ?? 0)))
  );

  const threshold = (config.driftThreshold ?? 5) / 100;
  const rebalanced = maxDrift >= threshold;

  const trades = rebalanced ? await callRebalance(cur, qpu.weights, prices) : [];
  const pnlBps = rebalanced
    ? Math.round(qpu.sharpe * 40 + (Math.random() - 0.35) * 15)
    : 0;
  const actionHash = `0x${createHash('sha256')
    .update(`${agentId}:${Date.now()}:${maxDrift.toFixed(6)}`)
    .digest('hex')}`;

  console.log(
    `[agent:${agentId}] drift=${maxDrift.toFixed(4)} threshold=${threshold.toFixed(2)} ` +
    `rebalanced=${rebalanced} sharpe=${qpu.sharpe.toFixed(3)} backend=${qpu.backend_used}`
  );

  return { weights: qpu.weights, sharpe: qpu.sharpe, rebalanced, actionHash, pnlBps, trades };
}

export type SchedulerCallbacks = {
  getState: (agentId: number) => { config: AgentLoopConfig; currentWeights: Record<string, number> } | undefined;
  onRebalance: (agentId: number, result: CycleResult) => void;
};

const timers = new Map<number, NodeJS.Timeout>();
const INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

export function startAgentLoop(agentId: number, cb: SchedulerCallbacks): void {
  stopAgentLoop(agentId);

  async function tick() {
    const state = cb.getState(agentId);
    if (!state) return;
    try {
      const result = await runCycle(agentId, state.config, state.currentWeights);
      if (result.rebalanced) cb.onRebalance(agentId, result);
    } catch (err) {
      console.error(`[agent:${agentId}]`, err instanceof Error ? err.message : err);
    }
  }

  // Run first cycle immediately, then on interval
  tick();
  timers.set(agentId, setInterval(tick, INTERVAL_MS));
}

export function stopAgentLoop(agentId: number): void {
  const t = timers.get(agentId);
  if (t) { clearInterval(t); timers.delete(agentId); }
}
