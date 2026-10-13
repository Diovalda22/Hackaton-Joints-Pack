from datetime import datetime
from enum import StrEnum
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt
from app.schemas.order import Order
from app.schemas.remnant import Remnant
from app.schemas.roadmap import Defect


class SolverStatus(StrEnum):
    OPTIMAL = "OPTIMAL"
    FEASIBLE_TIMEOUT = "FEASIBLE_TIMEOUT"
    BASELINE_FALLBACK = "BASELINE_FALLBACK"
    NO_ASSIGNABLE_PIECES = "NO_ASSIGNABLE_PIECES"


class ReasonCode(StrEnum):
    NO_VERIFIED_MATERIAL_MATCH = "NO_VERIFIED_MATERIAL_MATCH"
    DOES_NOT_FIT_ANY_COMPATIBLE_REMNANT = "DOES_NOT_FIT_ANY_COMPATIBLE_REMNANT"
    UNALLOCATED_AFTER_SEARCH = "UNALLOCATED_AFTER_SEARCH"
    BLOCKED_BY_DEFECT = "BLOCKED_BY_DEFECT"


class PlanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    order_id: str = Field(min_length=1)
    remnant_ids: list[str] | None = Field(default=None, max_length=15)
    solver_time_limit_sec: int | None = Field(default=None, strict=True, ge=1, le=8)


class Placement(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    piece_instance_id: str
    order_line_id: str
    remnant_id: str
    x_mm: StrictInt = Field(ge=0)
    y_mm: StrictInt = Field(ge=0)
    placed_width_mm: StrictInt = Field(gt=0)
    placed_height_mm: StrictInt = Field(gt=0)
    rotated: StrictBool


class Unallocated(BaseModel):
    piece_instance_id: str
    reason_code: ReasonCode


class Metrics(BaseModel):
    reuse_area_mm2: int
    reuse_area_m2: float
    unallocated_area_mm2: int
    unallocated_area_m2: float
    area_coverage_pct: float
    count_coverage_pct: float
    placed_count: int
    requested_count: int
    used_remnant_count: int


class PlanResult(BaseModel):
    placements: list[Placement]
    unallocated: list[Unallocated]
    metrics: Metrics


class SolverMetadata(BaseModel):
    engine: str
    engine_version: str
    random_seed: int
    time_limit_sec: int
    wall_time_sec: float
    raw_solver_status: str
    baseline_wall_time_sec: float = 0
    optimizer_objective: int | None = None
    baseline_objective: int = 0
    selected_objective: int = 0
    strategy_version: str = "ffd-edge-v1/cpsat-v1"


class InputSnapshot(BaseModel):
    order: Order
    remnants: list[Remnant]
    solver_time_limit_sec: int
    remnant_defects: dict[str, list[Defect]] | None = Field(default=None, exclude_if=lambda value: value is None)


class ExcludedRemnant(BaseModel):
    remnant_id: str
    reason_code: str


class Comparison(BaseModel):
    gain_vs_greedy_mm2: int
    gain_vs_greedy_m2: float
    gain_vs_greedy_count: int


class PlanRun(BaseModel):
    id: str
    order_id: str
    created_at: datetime
    solver_status: SolverStatus
    selected_strategy: str
    solver_metadata: SolverMetadata
    input_snapshot: InputSnapshot
    baseline: PlanResult
    selected: PlanResult
    comparison: Comparison
    excluded_remnants: list[ExcludedRemnant]
    warnings: list[str]
