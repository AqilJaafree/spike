from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import optimize, rebalance, risk, health

app = FastAPI(title="Spike Quantum Service", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(optimize.router, prefix="/optimize")
app.include_router(rebalance.router, prefix="/rebalance")
app.include_router(risk.router, prefix="/risk")
