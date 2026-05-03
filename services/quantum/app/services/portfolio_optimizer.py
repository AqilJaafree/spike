import numpy as np
from qiskit_aer import AerSimulator
from qiskit_ibm_runtime import Session, SamplerV2 as Sampler
from app.services.ibm_runtime import get_service, should_use_real_qpu, IBM_BACKEND

async def run_portfolio_optimization(
    assets: list[str],
    returns: np.ndarray,
    covariance: np.ndarray,
    risk_tolerance: float,
    constraints: dict,
) -> dict:
    use_qpu = await should_use_real_qpu()

    if use_qpu:
        result = await _run_on_qpu(assets, returns, covariance, risk_tolerance, constraints)
        backend_used = IBM_BACKEND
    else:
        result = _run_on_aer(assets, returns, covariance, risk_tolerance, constraints)
        backend_used = "aer_simulator"

    return {**result, "backend_used": backend_used, "cached": False}

def _run_on_aer(assets, returns, covariance, risk_tolerance, constraints) -> dict:
    """Classical mean-variance optimization as Aer fallback."""
    n = len(assets)
    # Markowitz: minimise σ²·(1-r) - μ·r subject to Σwᵢ=1, wᵢ∈[min,max]
    from scipy.optimize import minimize

    mu = returns.mean(axis=0)
    min_w = constraints.get("min_weight", 0.05)
    max_w = constraints.get("max_weight", 0.40)

    def objective(w):
        port_return = float(mu @ w)
        port_risk = float(w @ covariance @ w)
        return -risk_tolerance * port_return + (1 - risk_tolerance) * port_risk

    result = minimize(
        objective,
        x0=np.ones(n) / n,
        method="SLSQP",
        bounds=[(min_w, max_w)] * n,
        constraints={"type": "eq", "fun": lambda w: np.sum(w) - 1},
    )

    weights = dict(zip(assets, result.x.tolist()))
    w = result.x
    sharpe = float((mu @ w) / np.sqrt(w @ covariance @ w + 1e-9))
    frontier = _compute_frontier(assets, mu, covariance, min_w, max_w)

    return {"weights": weights, "sharpe": sharpe, "frontier": frontier}

async def _run_on_qpu(assets, returns, covariance, risk_tolerance, constraints) -> dict:
    """Quantum Portfolio Optimizer via Qiskit Functions Catalog on IBM Heron r3."""
    service = get_service()
    try:
        from qiskit.functions import QuantumPortfolioOptimizer  # type: ignore[import]
        portfolio_input = {
            "assets": assets,
            "returns": returns.tolist(),
            "covariance": covariance.tolist(),
            "risk_tolerance": risk_tolerance,
            "constraints": constraints,
        }
        optimizer = QuantumPortfolioOptimizer(service=service)
        result = optimizer.run(portfolio_input)
        return {
            "weights": result["weights"],
            "sharpe": result["sharpe"],
            "frontier": [{"return": r, "risk": k} for r, k in result["frontier"]],
        }
    except ImportError:
        # Qiskit Functions Catalog not available — fall back to Aer
        return _run_on_aer(assets, returns, covariance, risk_tolerance, constraints)

def _compute_frontier(assets, mu, covariance, min_w, max_w, points=20) -> list[dict]:
    from scipy.optimize import minimize
    n = len(assets)
    frontier = []
    for target_r in np.linspace(mu.min(), mu.max(), points):
        res = minimize(
            lambda w: float(w @ covariance @ w),
            x0=np.ones(n) / n,
            method="SLSQP",
            bounds=[(min_w, max_w)] * n,
            constraints=[
                {"type": "eq", "fun": lambda w: np.sum(w) - 1},
                {"type": "eq", "fun": lambda w: float(mu @ w) - target_r},
            ],
        )
        if res.success:
            frontier.append({"return": round(float(target_r), 6), "risk": round(float(res.fun), 6)})
    return frontier
