import { createHash } from 'crypto';
import { signAction } from '@spike/pqc';
import { inferMarketRegime, getQPUCache, storeQPUCache } from '@spike/0g-client';
import type { MarketRegime } from '@spike/0g-client';

const QUANTUM_URL = process.env.QUANTUM_SERVICE_URL ?? 'http://localhost:8000';

const COINGECKO_IDS: Record<string, string> = {
  ETH: 'ethereum', BTC: 'bitcoin', SOL: 'solana', USDC: 'usd-coin',
  ARB: 'arbitrum', MATIC: 'matic-network', LINK: 'chainlink', AVAX: 'avalanche-2',
};

const REGIME_RISK_DELTA: Record<MarketRegime, number> = {
  bull: 0.1, bear: -0.1, volatile: -0.15, sideways: 0,
};

const PRICE_WINDOW_SIZE = 10;
const priceWindow = new Map<number, Record<string, number[]>>();

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
  dilithiumSig?: string; // hex-encoded ML-DSA-65 signature of the action envelope
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
  riskTolerance: number,
): Promise<{ weights: Record<string, number>; sharpe: number; backend_used: string }> {
  const n = assets.length;
  const minWeight = 0.05;
  // max_weight must be >= 1 - (n-1)*minWeight so a feasible solution always exists
  const maxWeight = Math.max(0.40, 1 - (n - 1) * minWeight);
  const res = await fetch(`${QUANTUM_URL}/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assets,
      returns,
      covariance,
      risk_tolerance: riskTolerance,
      max_weight: maxWeight,
      min_weight: minWeight,
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
  dilithiumSk?: string,
): Promise<CycleResult> {
  const prices = await fetchPrices(config.assets);

  // Maintain rolling price window per agent for regime detection
  const window = priceWindow.get(agentId) ?? {};
  for (const [asset, price] of Object.entries(prices)) {
    const hist = window[asset] ?? [];
    hist.push(price);
    if (hist.length > PRICE_WINDOW_SIZE) hist.shift();
    window[asset] = hist;
  }
  priceWindow.set(agentId, window);

  const priceHistoryArr = config.assets.map(asset => ({
    asset,
    prices: window[asset] ?? [prices[asset]],
  }));

  // null signer is safe: inferMarketRegime only uses it when ZG_INFERENCE_PROVIDER is set
  const regime = await inferMarketRegime(null as any, priceHistoryArr);
  const baseRisk = config.riskLevel === 'aggressive' ? 0.8 : config.riskLevel === 'balanced' ? 0.5 : 0.2;
  const riskTolerance = Math.min(1, Math.max(0, baseRisk + REGIME_RISK_DELTA[regime]));

  const portfolioHash = createHash('sha256')
    .update([...config.assets].sort().join(',') + `:${riskTolerance.toFixed(2)}`)
    .digest('hex');

  let qpu: { weights: Record<string, number>; sharpe: number; backend_used: string };
  const cachedQPU = await getQPUCache(portfolioHash);
  if (cachedQPU) {
    qpu = { weights: cachedQPU.weights, sharpe: cachedQPU.sharpe, backend_used: 'cache' };
  } else {
    const { returns, covariance } = syntheticReturns(config.assets);
    const fresh = await callOptimize(config.assets, returns, covariance, riskTolerance);
    qpu = fresh;
    storeQPUCache(portfolioHash, {
      weights: fresh.weights,
      sharpe: fresh.sharpe,
      frontier: [],
      cachedAt: Date.now(),
      portfolioHash,
    });
  }

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
    .digest('hex')}` as `0x${string}`;

  // Sign the action with the Dilithium SK provided by the frontend at registration
  let dilithiumSig: string | undefined;
  if (dilithiumSk) {
    try {
      const sk = Uint8Array.from(
        (dilithiumSk.match(/.{2}/g) ?? []).map(b => parseInt(b, 16))
      );
      const { signature } = signAction(sk, {
        chainId: 16602n,
        contractAddress: '0x0000000000000000000000000000000000000000' as `0x${string}`,
        nonce: BigInt(Date.now()),
        actionHash,
        actionType: 'rebalance',
      });
      dilithiumSig = Array.from(signature).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (err) {
      console.warn(`[agent:${agentId}] Dilithium signing failed:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(
    `[agent:${agentId}] regime=${regime} risk=${riskTolerance.toFixed(2)} ` +
    `drift=${maxDrift.toFixed(4)} threshold=${threshold.toFixed(2)} ` +
    `rebalanced=${rebalanced} sharpe=${qpu.sharpe.toFixed(3)} backend=${qpu.backend_used}` +
    (dilithiumSig ? ` dilithium=signed(${dilithiumSig.length / 2}B)` : ' dilithium=unsigned')
  );

  return { weights: qpu.weights, sharpe: qpu.sharpe, rebalanced, actionHash, dilithiumSig, pnlBps, trades };
}

export type SchedulerCallbacks = {
  getState: (agentId: number) => { config: AgentLoopConfig; currentWeights: Record<string, number>; dilithiumSk?: string } | undefined;
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
      const result = await runCycle(agentId, state.config, state.currentWeights, state.dilithiumSk);
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
