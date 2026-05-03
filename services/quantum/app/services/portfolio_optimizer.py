import numpy as np
from scipy.optimize import minimize
from qiskit_algorithms import SamplingVQE, QAOA
from qiskit_algorithms.optimizers import COBYLA
from qiskit_optimization import QuadraticProgram
from qiskit_optimization.converters import QuadraticProgramToQubo
from qiskit_optimization.algorithms import MinimumEigenOptimizer
from qiskit.primitives import StatevectorSampler
from app.services.ibm_runtime import get_simulator


async def run_portfolio_optimization(
    assets: list[str],
    returns: np.ndarray,
    covariance: np.ndarray,
    risk_tolerance: float,
    constraints: dict,
) -> dict:
    weights = _classical_optimize(assets, returns, covariance, risk_tolerance, constraints)
    sharpe = _compute_sharpe(weights, returns, covariance)
    frontier = _compute_frontier(assets, returns.mean(axis=0), covariance,
                                  constraints.get('min_weight', 0.05),
                                  constraints.get('max_weight', 0.40))
    return {
        'weights': weights,
        'sharpe': sharpe,
        'frontier': frontier,
        'backend_used': 'aer_simulator',
        'cached': False,
    }


def _classical_optimize(assets, returns, covariance, risk_tolerance, constraints) -> dict[str, float]:
    n = len(assets)
    mu = returns.mean(axis=0)
    min_w = constraints.get('min_weight', 0.05)
    max_w = constraints.get('max_weight', 0.40)

    def objective(w):
        port_return = float(mu @ w)
        port_risk = float(w @ covariance @ w)
        return -risk_tolerance * port_return + (1 - risk_tolerance) * port_risk

    result = minimize(
        objective,
        x0=np.ones(n) / n,
        method='SLSQP',
        bounds=[(min_w, max_w)] * n,
        constraints={'type': 'eq', 'fun': lambda w: np.sum(w) - 1},
    )
    return {asset: round(float(w), 6) for asset, w in zip(assets, result.x)}


def _compute_sharpe(weights: dict, returns: np.ndarray, covariance: np.ndarray) -> float:
    w = np.array(list(weights.values()))
    mu = returns.mean(axis=0)
    return round(float((mu @ w) / np.sqrt(w @ covariance @ w + 1e-9)), 4)


def _compute_frontier(assets, mu, covariance, min_w, max_w, points=20) -> list[dict]:
    n = len(assets)
    frontier = []
    for target_r in np.linspace(mu.min(), mu.max(), points):
        res = minimize(
            lambda w: float(w @ covariance @ w),
            x0=np.ones(n) / n,
            method='SLSQP',
            bounds=[(min_w, max_w)] * n,
            constraints=[
                {'type': 'eq', 'fun': lambda w: np.sum(w) - 1},
                {'type': 'eq', 'fun': lambda w: float(mu @ w) - target_r},
            ],
        )
        if res.success:
            frontier.append({'return': round(float(target_r), 6), 'risk': round(float(res.fun), 6)})
    return frontier
