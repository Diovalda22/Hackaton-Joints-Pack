from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, StrictBool
from app.schemas.remnant import Code, Dimension


class OrderLineCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    label: str = Field(min_length=1, max_length=128)
    material_code: Code
    color_code: Code
    width_mm: Dimension
    height_mm: Dimension
    quantity: int = Field(strict=True, ge=1, le=30)
    allow_rotation_90: StrictBool = False


class OrderCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=128)
    lines: list[OrderLineCreate] = Field(min_length=1, max_length=30)


class OrderLine(OrderLineCreate):
    id: str


class Order(OrderCreate):
    id: str
    lines: list[OrderLine]
    created_at: datetime
    updated_at: datetime
