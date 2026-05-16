from fastapi import APIRouter

router = APIRouter()

@router.get('/health')
async def health():
    return {'status': 'ok', 'backend': 'scipy_slsqp', 'type': 'classical'}

@router.get('/supported-backends')
async def supported_backends():
    return {
        'backends': [
            {'name': 'scipy_slsqp', 'type': 'classical'},
        ]
    }
