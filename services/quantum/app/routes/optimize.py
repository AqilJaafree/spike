from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import numpy as np
from app.services.portfolio_optimizer import run_portfolio_optimization

router = APIRouter()

class OptimizeRequest(BaseModel):
    assets: list[str]
    returns: list[list[float]]    # [n_days x n_assets]
    covariance: list[list[float]] # [n_assets x n_assets]
    risk_tolerance: float = 0.5   # 0 = min risk, 1 = max return
    max_weight: float = 0.40
    min_weight: float = 0.05
    portfolio_hash: str           # used as cache key

class OptimizeResponse(BaseModel):
    weights: dict[str, float]
    sharpe: float
    frontier: list[dict]
    backend_used: str
    cached: bool

@router.post("", response_model=OptimizeResponse)
async def optimize(req: OptimizeRequest):
    try:
        result = await run_portfolio_optimization(
            assets=req.assets,
            returns=np.array(req.returns),
            covariance=np.array(req.covariance),
            risk_tolerance=req.risk_tolerance,
            constraints={"max_weight": req.max_weight, "min_weight": req.min_weight},
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
