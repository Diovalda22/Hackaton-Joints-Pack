from fastapi import APIRouter, Request
from app.services.roadmap import capabilities

router = APIRouter()


@router.get("/health")
def health(request: Request):
    return {"status": "ok", "service": "loopcut-backend", "version": "1.0.0",
            "capabilities": capabilities(request.app.state.repository, request.app.state.settings)}
