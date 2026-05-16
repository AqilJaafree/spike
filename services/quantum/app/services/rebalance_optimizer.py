async def run_rebalance_optimization(
    current_weights: dict,
    target_weights: dict,
    price_data: dict,
    max_trade_size: float,
) -> dict:
    trades = _build_trade_candidates(current_weights, target_weights, price_data, max_trade_size)
    selected = _greedy_select(trades)
    return {'selected_trades': selected, 'backend_used': 'scipy_greedy'}


def _build_trade_candidates(current, target, prices, max_trade_size) -> list[dict]:
    trades = []
    for asset in set(current) | set(target):
        delta = target.get(asset, 0) - current.get(asset, 0)
        if abs(delta) < 0.01:
            continue
        trades.append({
            'asset': asset,
            'action': 'buy' if delta > 0 else 'sell',
            'amount': round(min(abs(delta), max_trade_size), 4),
            'cost': prices.get(asset, 0) * abs(delta),
        })
    return trades


def _greedy_select(trades: list[dict]) -> list[dict]:
    return sorted(trades, key=lambda t: -t['amount'])
