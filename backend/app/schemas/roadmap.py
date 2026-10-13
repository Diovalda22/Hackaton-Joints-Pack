from typing import Literal
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field
from app.schemas.remnant import Dimension, Note


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ExecutionCreate(Input):
    plan_run_id: str = Field(min_length=1)
    mode: Literal["SYNTHETIC_DEMO"]


class ExecutionNote(Input):
    operator_note: Note = ""


class ItemPatch(Input):
    outcome: Literal["COMPLETED", "FAILED", "NOT_ATTEMPTED"]
    note: Note = ""


class DefectInput(Input):
    x_mm: int = Field(strict=True, ge=0, le=10000)
    y_mm: int = Field(strict=True, ge=0, le=10000)
    width_mm: Dimension
    height_mm: Dimension
    defect_type: str = Field(min_length=1, max_length=64)
    note: Note = ""


class Defect(DefectInput):
    id: str
    remnant_id: str
    verified_by_operator_at: str | None = None


class DefectReplace(Input):
    expected_updated_at: datetime
    defects: list[DefectInput] = Field(max_length=20)


class MeasuredLeftover(Input):
    code: str = Field(min_length=1, max_length=64)
    width_mm: Dimension
    height_mm: Dimension
    condition_note: Note = ""


class ReconciliationCreate(Input):
    source_remnant_id: str = Field(min_length=1)
    note: Note = ""
    leftovers: list[MeasuredLeftover] = Field(max_length=20)


class CsvPreview(Input):
    csv_text: str = Field(min_length=1, max_length=262144)


class ImportCommit(Input):
    preview_token: str = Field(min_length=1)


class VerifyEntry(Input):
    id: str
    expected_updated_at: datetime


class BulkVerify(Input):
    inspected: Literal[True]
    items: list[VerifyEntry] = Field(min_length=1, max_length=100)
