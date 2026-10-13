from typing import Annotated
from fastapi import APIRouter, Depends
from app.api.dependencies import workspace
from app.schemas.plan import PlanRequest, PlanRun
from app.services.workspace import WorkspaceService

router = APIRouter()
Service = Annotated[WorkspaceService, Depends(workspace)]


@router.post("/plan-runs", response_model=PlanRun, status_code=201)
def run_plan(input: PlanRequest, service: Service):
    # Sync endpoint keeps CPU work off the event loop. There is no job queue in the single-operator MVP.
    return service.run_plan(input)


@router.get("/plan-runs/{identity}", response_model=PlanRun)
def get_plan(identity: str, service: Service):
    return service.repository.get_plan(identity)
