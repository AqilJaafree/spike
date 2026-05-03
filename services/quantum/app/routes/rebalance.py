from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.rebalance_optimizer import run_rebalance_optimization

router = APIRouter()

class TradeCandidateInput(BaseModel):
    asset_pair: str
    amount: float
    cost: float

class RebalanceRequest(BaseModel):
    current_weights: dict[str, float]
    target_weights: dict[str, float]
    price_data: dict[str, float]
    max_trade_size: float = 0.20

class RebalanceResponse(BaseModel):
    selected_trades: list[dict]
    backend_used: str

@router.post("", response_model=RebalanceResponse)
async def rebalance(req: RebalanceRequest):
    try:
        result = await run_rebalance_optimization(
            current_weights=req.current_weights,
            target_weights=req.target_weights,
            price_data=req.price_data,
            max_trade_size=req.max_trade_size,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
