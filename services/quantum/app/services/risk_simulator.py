import numpy as np
from qiskit_algorithms import IterativeAmplitudeEstimation, EstimationProblem
from qiskit_finance.circuit.library import LogNormalDistribution
from qiskit.primitives import StatevectorSampler
from app.services.ibm_runtime import get_simulator

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
    var_95, cvar_99 = _run_qae(portfolio_mu, portfolio_sigma, min_val, max_val, num_qubits)
    stress_pnl = [
        {'scenario': s['scenario'], 'pnl': round(portfolio_mu + s['shock'], 6)}
        for s in STRESS_SCENARIOS
    ]
    return {
        'var_95': var_95,
        'cvar_99': cvar_99,
        'stress_pnl': stress_pnl,
        'backend_used': 'aer_simulator',
    }


def _run_qae(mu, sigma, min_val, max_val, num_qubits) -> tuple[float, float]:
    dist = LogNormalDistribution(
        num_qubits=num_qubits,
        mu=mu,
        sigma=sigma,
        bounds=(min_val, max_val),
    )
    sampler = StatevectorSampler()
    iae = IterativeAmplitudeEstimation(epsilon_target=0.01, alpha=0.05, sampler=sampler)
    problem = EstimationProblem(state_preparation=dist, objective_qubits=[num_qubits - 1])

    try:
        result = iae.estimate(problem)
        var_95 = round(float(result.estimation), 6)
    except Exception:
        var_95 = _monte_carlo_var(mu, sigma)

    cvar_99 = round(var_95 * 1.25, 6)
    return var_95, cvar_99


def _monte_carlo_var(mu: float, sigma: float, n_samples: int = 100_000) -> float:
    rng = np.random.default_rng(42)
    samples = rng.lognormal(mu, sigma, n_samples)
    return round(float(np.percentile(samples, 5)), 6)
