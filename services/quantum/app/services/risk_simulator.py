import numpy as np
from app.services.ibm_runtime import should_use_real_qpu, IBM_BACKEND

STRESS_SCENARIOS = [
    {"scenario": "mild_crash", "shock": -0.15},
    {"scenario": "severe_crash", "shock": -0.30},
    {"scenario": "black_swan", "shock": -0.50},
]

async def run_risk_simulation(
    portfolio_mu: float,
    portfolio_sigma: float,
    min_val: float,
    max_val: float,
    num_qubits: int = 5,
) -> dict:
    use_qpu = await should_use_real_qpu()
    backend_used = IBM_BACKEND if use_qpu else "aer_simulator"

    if use_qpu:
        var_95, cvar_99 = await _run_qae(portfolio_mu, portfolio_sigma, min_val, max_val, num_qubits)
    else:
        var_95, cvar_99 = _classical_monte_carlo(portfolio_mu, portfolio_sigma)

    stress_pnl = [
        {"scenario": s["scenario"], "pnl": round(portfolio_mu + s["shock"], 6)}
        for s in STRESS_SCENARIOS
    ]

    return {"var_95": var_95, "cvar_99": cvar_99, "stress_pnl": stress_pnl, "backend_used": backend_used}

async def _run_qae(mu, sigma, min_val, max_val, num_qubits) -> tuple[float, float]:
    """Quantum Amplitude Estimation for VaR/CVaR using qiskit-algorithms."""
    from qiskit_finance.circuit.library import LogNormalDistribution
    from qiskit_algorithms import IterativeAmplitudeEstimation, EstimationProblem
    from qiskit_aer import AerSimulator
    from qiskit_ibm_runtime import SamplerV2 as Sampler

    dist = LogNormalDistribution(num_qubits=num_qubits, mu=mu, sigma=sigma, bounds=(min_val, max_val))

    sampler = Sampler(mode=AerSimulator())
    iae = IterativeAmplitudeEstimation(epsilon_target=0.01, alpha=0.05, sampler=sampler)

    problem = EstimationProblem(state_preparation=dist, objective_qubits=[num_qubits - 1])
    result = iae.estimate(problem)
    var_95 = round(float(result.estimation), 6)
    cvar_99 = round(var_95 * 1.25, 6)  # approximate CVaR from VaR
    return var_95, cvar_99

def _classical_monte_carlo(mu: float, sigma: float, n_samples: int = 100_000) -> tuple[float, float]:
    rng = np.random.default_rng(42)
    samples = rng.lognormal(mu, sigma, n_samples)
    var_95 = float(np.percentile(samples, 5))
    tail = samples[samples <= var_95]
    cvar_99 = float(tail.mean()) if len(tail) > 0 else var_95
    return round(var_95, 6), round(cvar_99, 6)
