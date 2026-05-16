from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import optimize, rebalance, risk, health

app = FastAPI(title="Spike Quantum Service", version="0.2.0")

ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://spike-web3.netlify.app",
    "https://spike-agent.wanaqilre.workers.dev",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.include_router(health.router)
app.include_router(optimize.router, prefix="/optimize")
app.include_router(rebalance.router, prefix="/rebalance")
app.include_router(risk.router, prefix="/risk")
