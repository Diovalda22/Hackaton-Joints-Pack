from datetime import datetime
from enum import StrEnum
from typing import Annotated
from pydantic import BaseModel, ConfigDict, Field, BeforeValidator


def normalize_code(value: object) -> object:
    return value.strip().upper() if isinstance(value, str) else value


Code = Annotated[str, BeforeValidator(normalize_code), Field(min_length=1, max_length=64, pattern=r"^[A-Z0-9_-]+$")]
Dimension = Annotated[int, Field(strict=True, ge=1, le=10000)]
TextCode = Annotated[str, Field(min_length=1, max_length=64)]
Note = Annotated[str, Field(max_length=1000)]


class VerificationStatus(StrEnum):
    NEEDS_REVIEW = "NEEDS_REVIEW"
    VERIFIED = "VERIFIED"


class StockStatus(StrEnum):
    AVAILABLE = "AVAILABLE"
    QUARANTINED = "QUARANTINED"
    ARCHIVED = "ARCHIVED"


class RemnantCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    code: TextCode
    lot_code: str = Field(default="", max_length=128)
    material_code: Code
    color_code: Code
    width_mm: Dimension
    height_mm: Dimension
    condition_note: Note = ""
    source_note: Note = ""


class RemnantPatch(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    code: TextCode | None = None
    lot_code: str | None = Field(default=None, max_length=128)
    material_code: Code | None = None
    color_code: Code | None = None
    width_mm: Dimension | None = None
    height_mm: Dimension | None = None
    condition_note: Note | None = None
    source_note: Note | None = None
    verification_status: VerificationStatus | None = None
    stock_status: StockStatus | None = None


class Remnant(RemnantCreate):
    model_config = ConfigDict(extra="forbid", from_attributes=True)
    id: str
    verification_status: VerificationStatus = VerificationStatus.NEEDS_REVIEW
    stock_status: StockStatus = StockStatus.AVAILABLE
    created_at: datetime
    updated_at: datetime
