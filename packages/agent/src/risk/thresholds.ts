import type { RiskMetrics, AgentConfig } from '@spike/0g-client';

export interface RiskAssessment {
  safe: boolean;
  reason?: string;
}

export function assessRisk(metrics: RiskMetrics, config: AgentConfig): RiskAssessment {
  const maxDrawdownDecimal = config.maxDrawdown / 100;

  if (Math.abs(metrics.var95) > maxDrawdownDecimal) {
    return { safe: false, reason: `VaR(95%) ${(metrics.var95 * 100).toFixed(2)}% exceeds max drawdown ${config.maxDrawdown}%` };
  }

  // CVaR should not exceed 2× the max drawdown limit
  if (Math.abs(metrics.cvar99) > maxDrawdownDecimal * 2) {
    return { safe: false, reason: `CVaR(99%) ${(metrics.cvar99 * 100).toFixed(2)}% exceeds 2× drawdown limit` };
  }

  // Stress scenario: reject if black_swan loss is catastrophic (>80%)
  const blackSwan = metrics.stressPnl.find((s) => s.scenario === 'black_swan');
  if (blackSwan && Math.abs(blackSwan.pnl) > 0.8) {
    return { safe: false, reason: 'Black swan scenario exceeds 80% loss — halting rebalance' };
  }

  return { safe: true };
}
