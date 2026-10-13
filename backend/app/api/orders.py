from typing import Annotated
from fastapi import APIRouter, Depends
from app.api.dependencies import workspace
from app.schemas.order import Order, OrderCreate
from app.services.workspace import WorkspaceService

router = APIRouter()
Service = Annotated[WorkspaceService, Depends(workspace)]


@router.get("/orders")
def list_orders(service: Service):
    items = service.repository.list_orders()
    return {"items": items, "total": len(items)}


@router.post("/orders", response_model=Order, status_code=201)
def create_order(input: OrderCreate, service: Service):
    return service.create_order(input)


@router.get("/orders/{identity}", response_model=Order)
def get_order(identity: str, service: Service):
    return service.repository.get_order(identity)
