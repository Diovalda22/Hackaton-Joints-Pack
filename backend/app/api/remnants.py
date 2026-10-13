from typing import Annotated
from fastapi import APIRouter, Depends
from app.api.dependencies import workspace
from app.schemas.remnant import Remnant, RemnantCreate, RemnantPatch, VerificationStatus, StockStatus
from app.services.workspace import WorkspaceService

router = APIRouter()
Service = Annotated[WorkspaceService, Depends(workspace)]


@router.get("/remnants")
def list_remnants(service: Service, material_code: str | None = None, color_code: str | None = None,
                  verification_status: VerificationStatus | None = None, stock_status: StockStatus | None = None):
    items = service.repository.list_remnants()
    items = [r for r in items if (material_code is None or r.material_code == material_code.strip().upper())
             and (color_code is None or r.color_code == color_code.strip().upper())
             and (verification_status is None or r.verification_status == verification_status)
             and (stock_status is None or r.stock_status == stock_status)]
    return {"items": items, "total": len(items)}


@router.post("/remnants", response_model=Remnant, status_code=201)
def create_remnant(input: RemnantCreate, service: Service):
    return service.create_remnant(input)


@router.patch("/remnants/{identity}", response_model=Remnant)
def update_remnant(identity: str, input: RemnantPatch, service: Service):
    return service.update_remnant(identity, input)
