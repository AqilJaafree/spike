from fastapi import APIRouter
from app.services.ibm_runtime import get_backend_status

router = APIRouter()

@router.get("/health")
async def health():
    backend = await get_backend_status()
    return {"status": "ok", "backend": backend}

@router.get("/supported-backends")
async def supported_backends():
    return {
        "backends": [
            {"name": "ibm_heron_r3", "qubits": 176, "type": "real_qpu"},
            {"name": "aer_simulator", "qubits": 32, "type": "simulator"},
        ]
    }
