import type { ethers } from 'ethers';
import type { AgentConfig, QPUResult, RiskMetrics, AuditEntry } from '@spike/0g-client';
import { appendAuditLog, inferMarketRegime } from '@spike/0g-client';
import { dilithiumSign } from '@spike/pqc';
import { getOptimalWeights, getRebalanceTrades, getRiskMetrics } from '../quantum/client.js';
import { createHash } from 'crypto';

export interface DecisionLoopDeps {
  signer: ethers.Signer;
  agentId: number;
  dilithiumSecretKey: Uint8Array;
  getPrices: () => Promise<Record<string, number>>;
  getReturns: () => Promise<{ returns: number[][]; covariance: number[][] }>;
  getCurrentWeights: () => Promise<Record<string, number>>;
  executeRebalance: (trades: ReturnType<typeof getRebalanceTrades> extends Promise<infer T> ? T : never) => Promise<string>;
  getAttestationId: () => Promise<string>;
  /** Optional: records the action hash + tx hash on-chain via AgentRegistry.recordAction */
  recordActionOnChain?: (actionHash: string, txHash: string) => Promise<void>;
}

export async function runDecisionCycle(
  config: AgentConfig,
  deps: DecisionLoopDeps
): Promise<void> {
  const [prices, { returns, covariance }, currentWeights] = await Promise.all([
    deps.getPrices(),
    deps.getReturns(),
    deps.getCurrentWeights(),
  ]);

  // Market regime classification via 0G Compute inference
  const priceHistory = Object.entries(prices).map(([asset, price]) => ({ asset, prices: [price] }));
  const regime = await inferMarketRegime(deps.signer, priceHistory);

  // Portfolio optimization
  const qpuResult = await getOptimalWeights(config, returns, covariance);

  // Check if rebalance is needed (drift threshold)
  const maxDrift = Math.max(
    ...config.assets.map((a) => Math.abs((currentWeights[a] ?? 0) - (qpuResult.weights[a] ?? 0)))
  );

  if (maxDrift < config.driftThreshold / 100) return; // within tolerance — skip

  const trades = await getRebalanceTrades(currentWeights, qpuResult.weights, prices);
  const risk = await getRiskMetrics(0.05, 0.15, 0.5, 2.0);

  // Sign the rebalance decision with Dilithium3
  const decisionPayload = new TextEncoder().encode(JSON.stringify({ trades, qpuResult, regime }));
  const { signature } = await dilithiumSign(deps.dilithiumSecretKey, decisionPayload);

  const txHash = await deps.executeRebalance(trades);
  const attestationId = await deps.getAttestationId();

  const actionHash = createHash('sha256')
    .update(`${txHash}:${attestationId}:${Date.now()}`)
    .digest('hex');

  const entry: AuditEntry = {
    agentId: deps.agentId,
    timestamp: Date.now(),
    actionType: 'rebalance',
    txHash,
    actionHash,
    attested: !!attestationId,
    attestationId,
    details: { regime, sharpe: qpuResult.sharpe, var95: risk.var95, tradesCount: trades.length },
  };

  // Write to 0G Storage (immutable) + 0G KV (indexed) — returns Storage root hash as audit proof
  const auditRoot = await appendAuditLog(entry, deps.signer);

  // Record on-chain so the action hash is verifiable via AgentRegistry
  if (deps.recordActionOnChain) {
    await deps.recordActionOnChain(actionHash, txHash).catch(() => null);
  }

  if (auditRoot) {
    console.log(`[agent:${deps.agentId}] action recorded — 0G Storage root: ${auditRoot}`);
  }
}
