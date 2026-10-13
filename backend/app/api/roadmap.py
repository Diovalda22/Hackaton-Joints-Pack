from typing import Annotated, Literal
from fastapi import APIRouter, Depends, Request
from app.services.roadmap import RoadmapService
from app.schemas.roadmap import (ExecutionCreate, ExecutionNote, ItemPatch, ReconciliationCreate,
                                DefectReplace, CsvPreview, ImportCommit, BulkVerify)

router = APIRouter()


def roadmap(request: Request):
    return RoadmapService(request.app.state.repository, request.app.state.settings)


Service = Annotated[RoadmapService, Depends(roadmap)]


@router.get("/cut-executions")
def list_executions(service: Service, plan_run_id: str | None = None):
    return service.list_executions(plan_run_id)


@router.post("/cut-executions", status_code=201)
def create_execution(input: ExecutionCreate, service: Service):
    return service.create_execution(input)


@router.get("/cut-executions/{key}")
def get_execution(key: str, service: Service):
    return service.get_execution(key)


@router.post("/cut-executions/{key}/approve")
def approve(key: str, service: Service, input: ExecutionNote | None = None):
    return service.transition(key, "approve", input)


@router.post("/cut-executions/{key}/start")
def start(key: str, service: Service, input: ExecutionNote | None = None):
    return service.transition(key, "start", input)


@router.post("/cut-executions/{key}/confirm")
def confirm(key: str, service: Service, input: ExecutionNote | None = None):
    return service.transition(key, "confirm", input)


@router.post("/cut-executions/{key}/cancel")
def cancel(key: str, service: Service, input: ExecutionNote | None = None):
    return service.transition(key, "cancel", input)


@router.patch("/cut-executions/{key}/items/{piece_id}")
def item(key: str, piece_id: str, input: ItemPatch, service: Service):
    return service.patch_item(key, piece_id, input)


@router.post("/cut-executions/{key}/reconciliations", status_code=201)
def reconcile(key: str, input: ReconciliationCreate, service: Service):
    return service.reconcile(key, input)


@router.get("/remnants/{key}/history")
def history(key: str, service: Service):
    return service.history(key)


@router.get("/reports/summary")
def reports(service: Service, mode: Literal["SYNTHETIC_DEMO", "OPERATOR_REPORTED"] = "SYNTHETIC_DEMO"):
    return service.reports(mode)


@router.get("/remnants/{key}/defects")
def defects(key: str, service: Service):
    return service.get_defects(key)


@router.patch("/remnants/{key}/defects")
def replace_defects(key: str, input: DefectReplace, service: Service):
    return service.replace_defects(key, input)


@router.post("/remnants/import-preview")
def preview(input: CsvPreview, service: Service):
    return service.preview_csv(input)


@router.post("/remnants/import-commit")
def commit(input: ImportCommit, service: Service):
    return service.commit_csv(input)


@router.post("/remnants/bulk-verify")
def verify(input: BulkVerify, service: Service):
    return service.bulk_verify(input)
