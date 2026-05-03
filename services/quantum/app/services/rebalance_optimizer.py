from app.services.ibm_runtime import should_use_real_qpu, IBM_BACKEND

async def run_rebalance_optimization(
    current_weights: dict,
    target_weights: dict,
    price_data: dict,
    max_trade_size: float,
) -> dict:
    use_qpu = await should_use_real_qpu()
    backend_used = IBM_BACKEND if use_qpu else "aer_simulator"

    trades = _build_trade_candidates(current_weights, target_weights, price_data, max_trade_size)

    if use_qpu:
        selected = await _run_iskay(trades, max_trade_size)
    else:
        selected = _greedy_select(trades)

    return {"selected_trades": selected, "backend_used": backend_used}

def _build_trade_candidates(current, target, prices, max_trade_size) -> list[dict]:
    trades = []
    for asset in set(current) | set(target):
        delta = target.get(asset, 0) - current.get(asset, 0)
        if abs(delta) < 0.01:  # below 1% — skip
            continue
        trades.append({
            "asset": asset,
            "action": "buy" if delta > 0 else "sell",
            "amount": round(min(abs(delta), max_trade_size), 4),
            "cost": prices.get(asset, 0) * abs(delta),
        })
    return trades

async def _run_iskay(trades: list[dict], max_trade_size: float) -> list[dict]:
    """Iskay Quantum Optimizer by Kipu Quantum (Qiskit Functions addon)."""
    try:
        from kipu_quantum.iskay import IskayQuantumOptimizer  # type: ignore[import]
        from app.services.ibm_runtime import get_service
        service = get_service()
        optimizer = IskayQuantumOptimizer(service=service)
        result = optimizer.run({
            "variables": trades,
            "objective": "minimise_cost_and_deviation",
            "constraints": max_trade_size,
        })
        return result["selected_trades"]
    except ImportError:
        return _greedy_select(trades)

def _greedy_select(trades: list[dict]) -> list[dict]:
    """Classical greedy: sort by deviation magnitude, pick top trades."""
    return sorted(trades, key=lambda t: -t["amount"])
