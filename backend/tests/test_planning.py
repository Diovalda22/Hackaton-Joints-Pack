import pytest
from app.core.config import Settings
from app.core.errors import ApiError
from app.optimization.cp_sat import SolverOutcome
from app.optimization.domain import expand_order
from app.optimization.greedy import greedy
from app.schemas.plan import Placement
from app.services.planning import plan_order
from conftest import order, remnant


def test_no_stock_empty_result_without_calling_solver():
    def forbidden(*_):
        raise AssertionError("Solver must be skipped")
    plan = plan_order(order(), [], Settings(), solver=forbidden)
    assert plan.solver_status == "NO_ASSIGNABLE_PIECES"
    assert plan.solver_metadata.raw_solver_status == "SKIPPED"
    assert len(plan.selected.unallocated) == 2 and plan.selected.metrics.reuse_area_mm2 == 0


@pytest.mark.parametrize("change", [{"verification_status": "NEEDS_REVIEW"}, {"stock_status": "QUARANTINED"}, {"stock_status": "ARCHIVED"}])
def test_qualification_exclusions(change):
    plan = plan_order(order(), [remnant(**change)], Settings())
    assert not plan.selected.placements
    assert len(plan.excluded_remnants) == 1
    assert plan.selected.unallocated[0].reason_code == "NO_VERIFIED_MATERIAL_MATCH"


@pytest.mark.parametrize("stock,reason", [([remnant(material_code="DENIM")], "NO_VERIFIED_MATERIAL_MATCH"),
                                         ([remnant(color_code="WHITE")], "NO_VERIFIED_MATERIAL_MATCH"),
                                         ([remnant(w=10, h=10)], "DOES_NOT_FIT_ANY_COMPATIBLE_REMNANT")])
def test_unallocated_explanations(stock, reason):
    assert plan_order(order(), stock, Settings()).selected.unallocated[0].reason_code == reason


@pytest.mark.parametrize("raw", ["UNKNOWN", "MODEL_INVALID", "ERROR", "INFEASIBLE"])
def test_solver_failure_falls_back_and_does_not_claim_infeasible(raw):
    plan = plan_order(order(), [remnant()], Settings(), solver=lambda *_: SolverOutcome(raw))
    assert plan.solver_status == "BASELINE_FALLBACK" and plan.selected_strategy == "GREEDY"
    assert len(plan.selected.placements) == 2
    assert plan.solver_metadata.raw_solver_status == raw
    assert plan.comparison.gain_vs_greedy_mm2 == 0


@pytest.mark.parametrize("raw,expected", [("OPTIMAL", "OPTIMAL"), ("FEASIBLE", "BASELINE_FALLBACK")])
def test_tie_selection_policy(raw, expected):
    def solver(pieces, stock, *_):
        return SolverOutcome(raw, greedy(pieces, stock), engine_version="controlled-test")
    plan = plan_order(order(), [remnant()], Settings(), solver=solver)
    assert plan.solver_status == expected


def test_feasible_improvement_in_used_sheets_is_selected_even_with_zero_area_gain():
    o = order([dict(width_mm=700, height_mm=500), dict(width_mm=600, height_mm=300)])
    stock = [remnant("small", 800, 600), remnant("large", 1200, 800)]
    placements = [Placement(piece_instance_id="l0#1", order_line_id="l0", remnant_id="large", x_mm=0, y_mm=0,
                            placed_width_mm=700, placed_height_mm=500, rotated=False),
                  Placement(piece_instance_id="l1#1", order_line_id="l1", remnant_id="large", x_mm=0, y_mm=500,
                            placed_width_mm=600, placed_height_mm=300, rotated=False)]
    plan = plan_order(o, stock, Settings(), solver=lambda *_: SolverOutcome("FEASIBLE", placements))
    assert plan.baseline.metrics.used_remnant_count == 2
    assert plan.selected.metrics.used_remnant_count == 1
    assert plan.solver_status == "FEASIBLE_TIMEOUT" and plan.selected_strategy == "OPTIMIZER"
    assert plan.comparison.gain_vs_greedy_m2 == 0


def test_invalid_candidate_discarded_and_exception_fallback():
    placements = greedy(expand_order(order()), [remnant()])
    placements[1] = placements[0]
    plan = plan_order(order(), [remnant()], Settings(), solver=lambda *_: SolverOutcome("OPTIMAL", placements))
    assert plan.solver_status == "BASELINE_FALLBACK"
    assert plan.solver_metadata.optimizer_objective is None
    def crash(*_):
        raise RuntimeError("private diagnostic")
    plan = plan_order(order(), [remnant()], Settings(), solver=crash)
    assert plan.solver_metadata.raw_solver_status == "ERROR"
    assert all("private diagnostic" not in warning for warning in plan.warnings)


def test_worse_optimal_candidate_cannot_replace_valid_baseline():
    plan = plan_order(order(), [remnant()], Settings(), solver=lambda *_: SolverOutcome("OPTIMAL", []))
    assert plan.solver_status == "BASELINE_FALLBACK"
    assert plan.selected.metrics.placed_count == 2


def test_invalid_baseline_is_fatal(monkeypatch):
    import app.services.planning as planning
    placements = greedy(expand_order(order()), [remnant()])
    placements[1] = placements[0]
    monkeypatch.setattr(planning, "greedy", lambda *_: placements)
    with pytest.raises(ApiError) as exc:
        planning.plan_order(order(), [remnant()], Settings(enable_optimizer=False))
    assert exc.value.code == "INTERNAL_ERROR"


def test_plan_snapshot_does_not_alias_input_and_disabled_solver_is_explicit():
    o, r = order(), remnant()
    plan = plan_order(o, [r], Settings(enable_optimizer=False))
    o.name = "Edited"
    r.width_mm = 1
    assert plan.input_snapshot.order.name == "Pesanan uji"
    assert plan.input_snapshot.remnants[0].width_mm == 1000
    assert plan.solver_metadata.raw_solver_status == "SKIPPED"
    assert plan.solver_status == "BASELINE_FALLBACK"
