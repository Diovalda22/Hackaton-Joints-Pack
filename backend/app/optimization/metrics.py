from app.optimization.domain import Piece
from app.optimization.compatibility import unallocated_reason
from app.schemas.plan import Metrics, Placement, PlanResult, Unallocated
from app.schemas.remnant import Remnant


def result_for(placements: list[Placement], pieces: list[Piece], remnants: list[Remnant]) -> PlanResult:
    placed_ids = {p.piece_instance_id for p in placements}
    total_area = sum(p.area for p in pieces)
    area = sum(p.area for p in pieces if p.id in placed_ids)
    remaining = total_area - area
    unallocated = [Unallocated(piece_instance_id=p.id, reason_code=unallocated_reason(p, remnants))
                   for p in pieces if p.id not in placed_ids]
    metrics = Metrics(reuse_area_mm2=area, reuse_area_m2=area / 1_000_000,
                      unallocated_area_mm2=remaining, unallocated_area_m2=remaining / 1_000_000,
                      area_coverage_pct=100 * area / total_area if total_area else 0,
                      count_coverage_pct=100 * len(placed_ids) / len(pieces) if pieces else 0,
                      placed_count=len(placed_ids), requested_count=len(pieces),
                      used_remnant_count=len({p.remnant_id for p in placements}))
    return PlanResult(placements=placements, unallocated=unallocated, metrics=metrics)


def objective(result: PlanResult, n: int, m: int) -> int:
    metrics = result.metrics
    return metrics.reuse_area_mm2 * (n + 1) * (m + 1) + metrics.placed_count * (m + 1) - metrics.used_remnant_count
