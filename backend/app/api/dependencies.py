from fastapi import Request
from app.services.workspace import WorkspaceService


def workspace(request: Request) -> WorkspaceService:
    return WorkspaceService(request.app.state.repository, request.app.state.settings, request.app.state.solver)
