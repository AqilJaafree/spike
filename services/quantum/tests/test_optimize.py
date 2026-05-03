import pytest
import numpy as np
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.fixture
def sample_portfolio():
    assets = ['ETH', 'BTC', 'SOL', 'USDC']
    n = len(assets)
    rng = np.random.default_rng(42)
    returns = rng.normal(0.001, 0.02, (30, n)).tolist()
    cov = (rng.standard_normal((n, n)) * 0.01)
    cov = (cov @ cov.T).tolist()
    return {'assets': assets, 'returns': returns, 'covariance': cov}


@pytest.mark.asyncio
async def test_optimize_returns_valid_weights(sample_portfolio):
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        resp = await client.post('/optimize', json={
            **sample_portfolio,
            'risk_tolerance': 0.5,
            'max_weight': 0.40,
            'min_weight': 0.05,
            'portfolio_hash': 'test-hash-1',
        })
    assert resp.status_code == 200
    data = resp.json()
    assert set(data['weights'].keys()) == set(sample_portfolio['assets'])
    assert abs(sum(data['weights'].values()) - 1.0) < 0.01
    assert data['sharpe'] is not None
    assert data['backend_used'] == 'aer_simulator'


@pytest.mark.asyncio
async def test_optimize_weights_within_bounds(sample_portfolio):
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        resp = await client.post('/optimize', json={
            **sample_portfolio,
            'risk_tolerance': 0.3,
            'max_weight': 0.40,
            'min_weight': 0.05,
            'portfolio_hash': 'test-hash-2',
        })
    data = resp.json()
    for w in data['weights'].values():
        assert 0.04 <= w <= 0.41  # small tolerance for optimizer


@pytest.mark.asyncio
async def test_health():
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        resp = await client.get('/health')
    assert resp.status_code == 200
    assert resp.json()['status'] == 'ok'
