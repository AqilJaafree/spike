import numpy as np

STRESS_SCENARIOS = [
    {'scenario': 'mild_crash', 'shock': -0.15},
    {'scenario': 'severe_crash', 'shock': -0.30},
    {'scenario': 'black_swan', 'shock': -0.50},
]


async def run_risk_simulation(
    portfolio_mu: float,
    portfolio_sigma: float,
    min_val: float,
    max_val: float,
    num_qubits: int = 5,
) -> dict:
    var_95 = _monte_carlo_var(portfolio_mu, portfolio_sigma)
    cvar_99 = round(var_95 * 0.80, 6)
    stress_pnl = [
        {'scenario': s['scenario'], 'pnl': round(portfolio_mu + s['shock'], 6)}
        for s in STRESS_SCENARIOS
    ]
    return {
        'var_95': var_95,
        'cvar_99': cvar_99,
        'stress_pnl': stress_pnl,
        'backend_used': 'monte_carlo',
    }


def _monte_carlo_var(mu: float, sigma: float, n_samples: int = 100_000) -> float:
    rng = np.random.default_rng(42)
    samples = rng.lognormal(mu, sigma, n_samples)
    return round(float(np.percentile(samples, 5)), 6)
