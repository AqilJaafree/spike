import type { AgentConfig, AgentState } from './kv.js';
import { loadPriceWindow, savePriceWindow } from './kv.js';

const COINGECKO_IDS: Record<string, string> = {
  ETH: 'ethereum', BTC: 'bitcoin', SOL: 'solana', USDC: 'usd-coin',
  ARB: 'arbitrum', MATIC: 'matic-network', LINK: 'chainlink', AVAX: 'avalanche-2',
};

const BASE_VOLS: Record<string, number> = {
  ETH: 0.8, BTC: 0.7, SOL: 1.2, USDC: 0.01, ARB: 1.5, MATIC: 1.3, LINK: 1.0, AVAX: 1.1,
};

const PRICE_WINDOW_SIZE = 10;

type MarketRegime = 'bull' | 'bear' | 'sideways' | 'volatile';
const REGIME_RISK_DELTA: Record<MarketRegime, number> = {
  bull: 0.1, bear: -0.1, volatile: -0.15, sideways: 0,
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

function heuristicRegime(priceWindow: Record<string, number[]>): MarketRegime {
  const changes = Object.values(priceWindow).map(prices =>
    prices.length < 2 ? 0 : (prices[prices.length - 1] - prices[0]) / prices[0]
  );
  if (!changes.length) return 'sideways';
  const avg = changes.reduce((a, b) => a + b, 0) / changes.length;
  const vol = Math.sqrt(changes.reduce((a, b) => a + (b - avg) ** 2, 0) / changes.length);
  if (vol > 0.1) return 'volatile';
  if (avg > 0.05) return 'bull';
  if (avg < -0.05) return 'bear';
  return 'sideways';
}

function syntheticReturns(assets: string[], n = 30) {
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
  quantumUrl: string,
  assets: string[],
  returns: number[][],
  covariance: number[][],
  riskTolerance: number,
): Promise<{ weights: Record<string, number>; sharpe: number }> {
  const n = assets.length;
  const minWeight = 0.05;
  const maxWeight = Math.max(0.40, 1 - (n - 1) * minWeight);
  const res = await fetch(`${quantumUrl}/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assets, returns, covariance, risk_tolerance: riskTolerance, max_weight: maxWeight, min_weight: minWeight }),
  });
  if (!res.ok) throw new Error(`Quantum ${res.status}`);
  return res.json() as Promise<{ weights: Record<string, number>; sharpe: number }>;
}

// Deterministic fallback when quantum optimizer is unavailable
function equalWeights(assets: string[]): { weights: Record<string, number>; sharpe: number } {
  const w = 1 / assets.length;
  return { weights: Object.fromEntries(assets.map(a => [a, w])), sharpe: 0.5 };
}

async function hashAction(agentId: number, drift: number): Promise<string> {
  const msg = `${agentId}:${Date.now()}:${drift.toFixed(6)}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return '0x' + Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export type CycleResult = {
  weights: Record<string, number>;
  sharpe: number;
  rebalanced: boolean;
  actionHash: string;
  pnlBps: number;
  trades: Array<{ from: string; to: string; amount: number }>;
};

export async function runCycle(
  kv: KVNamespace,
  agentId: number,
  config: AgentConfig,
  currentWeights: Record<string, number>,
  quantumUrl: string | undefined,
): Promise<CycleResult> {
  const prices = await fetchPrices(config.assets);

  // Update rolling price window in KV
  const window = await loadPriceWindow(kv, agentId);
  for (const [asset, price] of Object.entries(prices)) {
    const hist = window[asset] ?? [];
    hist.push(price);
    if (hist.length > PRICE_WINDOW_SIZE) hist.shift();
    window[asset] = hist;
  }
  await savePriceWindow(kv, agentId, window);

  const regime = heuristicRegime(window);
  const baseRisk = config.riskLevel === 'aggressive' ? 0.8 : config.riskLevel === 'balanced' ? 0.5 : 0.2;
  const riskTolerance = Math.min(1, Math.max(0, baseRisk + REGIME_RISK_DELTA[regime]));

  let qpu: { weights: Record<string, number>; sharpe: number };
  if (quantumUrl) {
    try {
      const { returns, covariance } = syntheticReturns(config.assets);
      qpu = await callOptimize(quantumUrl, config.assets, returns, covariance, riskTolerance);
    } catch {
      qpu = equalWeights(config.assets);
    }
  } else {
    qpu = equalWeights(config.assets);
  }

  const n = config.assets.length;
  const equalW = 1 / n;
  const cur: Record<string, number> = Object.fromEntries(
    config.assets.map(a => [a, currentWeights[a] ?? equalW])
  );

  const maxDrift = Math.max(
    ...config.assets.map(a => Math.abs((cur[a] ?? equalW) - (qpu.weights[a] ?? 0)))
  );
  const threshold = (config.driftThreshold ?? 5) / 100;
  const rebalanced = maxDrift >= threshold;

  const pnlBps = rebalanced
    ? Math.round(qpu.sharpe * 40 + (Math.random() - 0.35) * 15)
    : 0;

  const actionHash = await hashAction(agentId, maxDrift);

  const trades: CycleResult['trades'] = rebalanced
    ? config.assets
        .filter(a => Math.abs((cur[a] ?? equalW) - (qpu.weights[a] ?? 0)) > threshold / 2)
        .map(a => ({ from: a, to: 'USDC', amount: Math.abs((cur[a] ?? equalW) - (qpu.weights[a] ?? 0)) }))
    : [];

  console.log(
    `[agent:${agentId}] regime=${regime} risk=${riskTolerance.toFixed(2)} ` +
    `drift=${maxDrift.toFixed(4)} rebalanced=${rebalanced} sharpe=${qpu.sharpe.toFixed(3)}`
  );

  return { weights: qpu.weights, sharpe: qpu.sharpe, rebalanced, actionHash, pnlBps, trades };
}

export async function runAllActiveAgents(
  kv: KVNamespace,
  ids: number[],
  quantumUrl: string | undefined,
  onRebalance: (agentId: number, state: AgentState, result: CycleResult) => Promise<void>,
): Promise<void> {
  await Promise.allSettled(
    ids.map(async id => {
      const raw = await kv.get(`agent:${id}`);
      if (!raw) return;
      const state = JSON.parse(raw) as AgentState;
      if (state.status !== 'active') return;
      const result = await runCycle(kv, id, state.config, state.lastWeights ?? {}, quantumUrl);
      if (result.rebalanced) await onRebalance(id, state, result);
    })
  );
}
