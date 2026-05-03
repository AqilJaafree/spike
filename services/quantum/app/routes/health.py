from fastapi import APIRouter
from qiskit_aer import AerSimulator

router = APIRouter()

@router.get('/health')
async def health():
    sim = AerSimulator()
    return {'status': 'ok', 'backend': sim.name, 'type': 'aer_simulator'}

@router.get('/supported-backends')
async def supported_backends():
    return {
        'backends': [
            {'name': 'aer_simulator', 'qubits': 32, 'type': 'simulator'},
        ]
    }
