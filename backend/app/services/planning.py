from collections.abc import Callable
from datetime import datetime, timezone
from time import perf_counter
from uuid import uuid4
import logging
from app.core.config import Settings
from app.core.errors import ApiError
from app.optimization.compatibility import orientations
from app.optimization.cp_sat import SolverOutcome, solve_cp_sat
from app.optimization.domain import expand_order
from app.optimization.greedy import greedy
from app.optimization.metrics import objective, result_for
from app.optimization.validator import InvalidLayout, validate_layout
from app.schemas.order import Order
from app.schemas.plan import Comparison, InputSnapshot, PlanRun, SolverMetadata, SolverStatus, ReasonCode
from app.optimization.defects import has_clear_position
from app.schemas.remnant import Remnant
from app.services.qualification import qualify

logger = logging.getLogger(__name__)
Solver = Callable[..., SolverOutcome]


def plan_order(order: Order, requested: list[Remnant], settings: Settings,
               time_limit_sec: int | None = None, solver: Solver | None = None, defects: dict | None = None) -> PlanRun:
    limit = time_limit_sec if time_limit_sec is not None else settings.solver_time_limit_sec
    if type(limit) is not int or not 1 <= limit <= 8:
        raise ApiError("VALIDATION_ERROR", "Batas solver harus 1–8 detik.")
    order = order.model_copy(deep=True)
    requested = [r.model_copy(deep=True) for r in requested]
    pieces = expand_order(order)
    if not 1 <= len(pieces) <= 30:
        raise ApiError("TOO_MANY_PIECES", "Maksimum 30 komponen per perhitungan.")
    if len(requested) > 15 or len({r.id for r in requested}) != len(requested):
        raise ApiError("VALIDATION_ERROR", "Pilih maksimal 15 kain tanpa duplikasi.")
    eligible, excluded = qualify(requested)
    defects = {key: [d.model_copy(deep=True) for d in zones] for key, zones in (defects or {}).items()
               if key in {r.id for r in requested}}
    piece_map = {p.id: p for p in pieces}
    def result(placements):
        value = result_for(placements, pieces, eligible)
        for unit in value.unallocated:
            piece = piece_map[unit.piece_instance_id]
            compatible = [r for r in eligible if orientations(piece, r)]
            if compatible and not any(has_clear_position(piece, r, defects.get(r.id, [])) for r in compatible):
                unit.reason_code = ReasonCode.BLOCKED_BY_DEFECT
        return value
    start = perf_counter()
    baseline_placements = greedy(pieces, eligible, defects)
    baseline = result(baseline_placements)
    try:
        validate_layout(baseline.placements, pieces, eligible, baseline.unallocated, defects)
    except InvalidLayout as exc:
        logger.exception("Greedy layout invalid")
        raise ApiError("INTERNAL_ERROR", "Rencana baseline gagal validasi geometri.", 500) from exc
    baseline_time = perf_counter() - start
    n, m = len(pieces), len(eligible)
    baseline_score = objective(baseline, n, m)
    selected, strategy = baseline, "GREEDY"
    status = SolverStatus.BASELINE_FALLBACK
    warnings = ["Simulasi perencanaan: run ini belum mengurangi stok atau menjamin penghematan pembelian bahan.",
                "Ukuran potong harus sudah mencakup allowance; kerf tidak dimodelkan. Zona cacat hanya sesuai pemetaan manual tersimpan."]
    score = None
    if not any(orientations(piece, r) for piece in pieces for r in eligible):
        status = SolverStatus.NO_ASSIGNABLE_PIECES
        outcome = SolverOutcome("SKIPPED", engine_version="not-run")
    elif not settings.enable_optimizer:
        outcome = SolverOutcome("SKIPPED", engine_version="ffd-edge-v1")
        warnings.append("CP-SAT dinonaktifkan; hasil adalah baseline greedy, bukan solusi optimal terbukti.")
    else:
        started = perf_counter()
        try:
            args = (pieces, eligible, limit, settings.solver_random_seed)
            outcome = (solver or solve_cp_sat)(*args, defects) if defects else (solver or solve_cp_sat)(*args)
        except Exception:
            logger.exception("Optimizer execution failed")
            outcome = SolverOutcome("ERROR", wall_time_sec=perf_counter() - started,
                                    warning="Optimizer mengalami kegagalan; menampilkan baseline valid.")
        if outcome.warning:
            warnings.append(outcome.warning)
        if outcome.raw_status in ("OPTIMAL", "FEASIBLE"):
            try:
                candidate = result(outcome.placements)
                validate_layout(candidate.placements, pieces, eligible, candidate.unallocated, defects)
            except (InvalidLayout, ValueError):
                logger.exception("Discarded invalid optimizer output")
                warnings.append("Solusi optimizer gagal validasi; menampilkan baseline valid.")
            else:
                score = objective(candidate, n, m)
                if score > baseline_score or (score == baseline_score and outcome.raw_status == "OPTIMAL"):
                    selected, strategy = candidate, "OPTIMIZER"
                    status = SolverStatus.OPTIMAL if outcome.raw_status == "OPTIMAL" else SolverStatus.FEASIBLE_TIMEOUT
        if strategy == "GREEDY":
            warnings.append("Optimizer tidak memberikan solusi valid yang lebih baik dalam budget; baseline dipilih.")
        elif status == SolverStatus.FEASIBLE_TIMEOUT:
            warnings.append("Rencana valid ditemukan, tetapi optimalitas belum terbukti.")
    validate_layout(selected.placements, pieces, eligible, selected.unallocated, defects)
    gain = selected.metrics.reuse_area_mm2 - baseline.metrics.reuse_area_mm2
    return PlanRun(
        id=f"pr_{uuid4().hex}", order_id=order.id, created_at=datetime.now(timezone.utc),
        solver_status=status, selected_strategy=strategy,
        solver_metadata=SolverMetadata(engine="ortools-cpsat" if settings.enable_optimizer else "greedy-ffd",
                                       engine_version=outcome.engine_version, random_seed=settings.solver_random_seed,
                                       time_limit_sec=limit, wall_time_sec=outcome.wall_time_sec,
                                       raw_solver_status=outcome.raw_status, baseline_wall_time_sec=baseline_time,
                                       optimizer_objective=score, baseline_objective=baseline_score,
                                       selected_objective=objective(selected, n, m),
                                       strategy_version="ffd-edge-v2/cpsat-defects-v2" if defects else "ffd-edge-v1/cpsat-v1"),
        input_snapshot=InputSnapshot(order=order, remnants=requested, solver_time_limit_sec=limit,
                                     remnant_defects=defects or None),
        baseline=baseline, selected=selected,
        comparison=Comparison(gain_vs_greedy_mm2=gain, gain_vs_greedy_m2=gain / 1_000_000,
                              gain_vs_greedy_count=selected.metrics.placed_count - baseline.metrics.placed_count),
        excluded_remnants=excluded, warnings=warnings,
    )
