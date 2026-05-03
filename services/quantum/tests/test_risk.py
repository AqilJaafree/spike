import pytest
from httpx import AsyncClient
from app.main import app


@pytest.mark.asyncio
async def test_risk_returns_var_cvar():
    async with AsyncClient(app=app, base_url='http://test') as client:
        resp = await client.post('/risk', json={
            'portfolio_mu': 0.05,
            'portfolio_sigma': 0.15,
            'min_val': 0.5,
            'max_val': 2.0,
            'num_qubits': 3,
        })
    assert resp.status_code == 200
    data = resp.json()
    assert 'var_95' in data
    assert 'cvar_99' in data
    assert isinstance(data['stress_pnl'], list)
    assert len(data['stress_pnl']) == 3


@pytest.mark.asyncio
async def test_risk_cvar_greater_than_var():
    async with AsyncClient(app=app, base_url='http://test') as client:
        resp = await client.post('/risk', json={
            'portfolio_mu': 0.03,
            'portfolio_sigma': 0.20,
            'min_val': 0.3,
            'max_val': 3.0,
        })
    data = resp.json()
    # CVaR should be worse (lower) than VaR
    assert data['cvar_99'] <= data['var_95'] + 0.01
