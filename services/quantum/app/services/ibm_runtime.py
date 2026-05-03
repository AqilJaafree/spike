import os
import asyncio
from qiskit_ibm_runtime import QiskitRuntimeService

IBM_QUANTUM_TOKEN = os.getenv("IBM_QUANTUM_TOKEN", "")
IBM_BACKEND = os.getenv("IBM_QUANTUM_BACKEND", "ibm_pittsburgh")  # Heron r3
QPU_QUEUE_THRESHOLD_S = int(os.getenv("QPU_QUEUE_THRESHOLD_S", "60"))

_service: QiskitRuntimeService | None = None

def get_service() -> QiskitRuntimeService:
    global _service
    if _service is None and IBM_QUANTUM_TOKEN:
        _service = QiskitRuntimeService(channel="ibm_quantum", token=IBM_QUANTUM_TOKEN)
    return _service

async def get_backend_status() -> dict:
    """Returns real QPU if queue is below threshold, else falls back to Aer."""
    service = get_service()
    if service is None:
        return {"name": "aer_simulator", "type": "simulator", "reason": "no_ibm_token"}

    try:
        backend = service.backend(IBM_BACKEND)
        status = backend.status()
        queue_len = status.pending_jobs
        if queue_len > QPU_QUEUE_THRESHOLD_S:
            return {"name": "aer_simulator", "type": "simulator", "reason": "queue_too_long", "queue": queue_len}
        return {"name": IBM_BACKEND, "type": "real_qpu", "queue": queue_len}
    except Exception:
        return {"name": "aer_simulator", "type": "simulator", "reason": "ibm_unreachable"}

async def should_use_real_qpu() -> bool:
    status = await get_backend_status()
    return status.get("type") == "real_qpu"
