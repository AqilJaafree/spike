const QUANTUM_URL = process.env.NEXT_PUBLIC_QUANTUM_URL ?? 'http://localhost:8000';
const TIMEOUT_MS = 8000;

export interface OptimizeResult {
  weights: Record<string, number>;
  sharpe: number;
  frontier: Array<{ return: number; risk: number }>;
  backend_used: string;
  cached: boolean;
}

const ASSET_MU: Record<string, number> = {
  ETH: 0.0012, BTC: 0.0010, SOL: 0.0018, USDC: 0.00001,
  ARB: 0.0015, OP: 0.0014, LINK: 0.0008, AAVE: 0.0011,
};
const ASSET_SIGMA: Record<string, number> = {
  ETH: 0.025, BTC: 0.020, SOL: 0.040, USDC: 0.001,
  ARB: 0.045, OP: 0.045, LINK: 0.030, AAVE: 0.035,
};

function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalRng(rng: () => number): number {
  const u1 = rng() || 1e-10;
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function buildSyntheticReturns(assets: string[]): { returns: number[][]; covariance: number[][] } {
  const n = assets.length;
  const seed = assets.reduce((a, s) => a + s.charCodeAt(0), 0);
  const rng = seededRng(seed);

  const returns: number[][] = Array.from({ length: 30 }, () =>
    assets.map(sym => {
      const mu = ASSET_MU[sym] ?? 0.001;
      const sigma = ASSET_SIGMA[sym] ?? 0.03;
      return mu + normalRng(rng) * sigma;
    })
  );

  // Diagonal covariance with small off-diagonal correlation
  const covariance: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      const si = ASSET_SIGMA[assets[i]] ?? 0.03;
      const sj = ASSET_SIGMA[assets[j]] ?? 0.03;
      return i === j ? si * si : 0.15 * si * sj;
    })
  );

  return { returns, covariance };
}

export async function optimizePortfolio(
  assets: string[],
  riskTolerance: number,
): Promise<OptimizeResult> {
  const { returns, covariance } = buildSyntheticReturns(assets);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${QUANTUM_URL}/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assets,
        returns,
        covariance,
        risk_tolerance: riskTolerance,
        max_weight: 0.40,
        min_weight: 0.05,
        portfolio_hash: assets.sort().join('-'),
      }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}
