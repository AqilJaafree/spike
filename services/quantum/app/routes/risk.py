from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.risk_simulator import run_risk_simulation

router = APIRouter()

class RiskRequest(BaseModel):
    portfolio_mu: float      # expected log-return
    portfolio_sigma: float   # volatility
    min_val: float
    max_val: float
    num_qubits: int = 5

class RiskResponse(BaseModel):
    var_95: float
    cvar_99: float
    stress_pnl: list[dict]   # [{ scenario, pnl }]
    backend_used: str

@router.post("", response_model=RiskResponse)
async def risk(req: RiskRequest):
    try:
        result = await run_risk_simulation(
            portfolio_mu=req.portfolio_mu,
            portfolio_sigma=req.portfolio_sigma,
            min_val=req.min_val,
            max_val=req.max_val,
            num_qubits=req.num_qubits,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
