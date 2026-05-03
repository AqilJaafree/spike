import type { AgentConfig, QPUResult, RiskMetrics, TradeAction } from '@spike/0g-client';
import { getQPUCache, storeQPUCache } from '@spike/0g-client';
import { createHash } from 'crypto';

const QUANTUM_URL = process.env.QUANTUM_SERVICE_URL ?? 'http://localhost:8000';

function portfolioHash(assets: string[], weights: Record<string, number>): string {
  return createHash('sha256')
    .update(JSON.stringify({ assets: assets.sort(), weights }))
    .digest('hex');
}

export async function getOptimalWeights(
  config: AgentConfig,
  returns: number[][],
  covariance: number[][]
): Promise<QPUResult> {
  const hash = portfolioHash(config.assets, {});

  const cached = await getQPUCache(hash);
  if (cached) return cached;

  const res = await fetch(`${QUANTUM_URL}/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assets: config.assets,
      returns,
      covariance,
      risk_tolerance: config.riskLevel === 'aggressive' ? 0.8 : config.riskLevel === 'balanced' ? 0.5 : 0.2,
      max_weight: 0.40,
      min_weight: 0.05,
      portfolio_hash: hash,
    }),
  });

  if (!res.ok) throw new Error(`Quantum optimize failed: ${res.status}`);
  const result = await res.json() as QPUResult;
  result.cachedAt = Date.now();
  result.portfolioHash = hash;

  await storeQPUCache(hash, result);
  return result;
}

export async function getRebalanceTrades(
  currentWeights: Record<string, number>,
  targetWeights: Record<string, number>,
  priceData: Record<string, number>,
  maxTradeSize = 0.20
): Promise<TradeAction[]> {
  const res = await fetch(`${QUANTUM_URL}/rebalance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_weights: currentWeights, target_weights: targetWeights, price_data: priceData, max_trade_size: maxTradeSize }),
  });
  if (!res.ok) throw new Error(`Quantum rebalance failed: ${res.status}`);
  const data = await res.json() as { selected_trades: TradeAction[] };
  return data.selected_trades;
}

export async function getRiskMetrics(
  mu: number,
  sigma: number,
  minVal: number,
  maxVal: number
): Promise<RiskMetrics> {
  const res = await fetch(`${QUANTUM_URL}/risk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ portfolio_mu: mu, portfolio_sigma: sigma, min_val: minVal, max_val: maxVal }),
  });
  if (!res.ok) throw new Error(`Quantum risk failed: ${res.status}`);
  const data = await res.json() as { var_95: number; cvar_99: number; stress_pnl: Array<{ scenario: string; pnl: number }> };
  return { var95: data.var_95, cvar99: data.cvar_99, stressPnl: data.stress_pnl };
}
