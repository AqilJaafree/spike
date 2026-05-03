export type RiskLevel = 'conservative' | 'balanced' | 'aggressive';
export type RebalanceFrequency = 'daily' | 'weekly' | 'on-drift';
export type MarketRegime = 'bull' | 'bear' | 'sideways' | 'volatile';

export interface AgentConfig {
  riskLevel: RiskLevel;
  assets: string[];             // token symbols
  targetApy: number;            // percentage
  maxDrawdown: number;          // percentage
  rebalanceFrequency: RebalanceFrequency;
  qrngSeedingEnabled: boolean;
  qaaoDepth?: number;
  driftThreshold: number;       // percentage — skip QPU if drift below this
}

export interface QPUResult {
  weights: Record<string, number>;  // { ETH: 0.35, BTC: 0.30, ... }
  sharpe: number;
  frontier: Array<{ return: number; risk: number }>;
  cachedAt: number;                 // unix ms
  portfolioHash: string;
}

export interface RiskMetrics {
  var95: number;
  cvar99: number;
  stressPnl: Array<{ scenario: string; pnl: number }>;
}

export interface TradeAction {
  asset: string;
  action: 'buy' | 'sell' | 'hold';
  amount: number;
}

export interface AuditEntry {
  agentId: number;
  timestamp: number;
  actionType: 'deploy' | 'rebalance' | 'pause' | 'resume' | 'withdraw' | 'config-update';
  txHash?: string;
  actionHash?: string;
  attested: boolean;
  attestationId?: string;
  details?: Record<string, unknown>;
}

export interface StorageRef {
  rootHash: string;
  uploadedAt: number;
}
