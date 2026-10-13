import pytest
pytest.importorskip("ortools", reason="OR-Tools belum tersedia; pengujian CP-SAT nyata memerlukan requirements.")
from app.optimization.cp_sat import solve_cp_sat
from app.optimization.domain import expand_order
from app.optimization.metrics import result_for
from app.optimization.validator import validate_layout
from app.services.planning import plan_order
from app.core.config import Settings
from conftest import order, remnant

pytestmark = pytest.mark.optimizer


@pytest.mark.parametrize("rotated", [False, True])
def test_real_solver_exact_fit(rotated):
    o = order([dict(width_mm=900 if rotated else 400, height_mm=400 if rotated else 900, allow_rotation_90=rotated)])
    stock = [remnant(w=400, h=900)]
    pieces = expand_order(o)
    result = solve_cp_sat(pieces, stock, 2, 2026)
    assert result.raw_status == "OPTIMAL"
    assert len(result.placements) == 1
    assert result.placements[0].rotated == rotated
    validate_layout(result.placements, pieces, stock)


def test_true_optimizer_can_reduce_sheets():
    o = order([dict(width_mm=700, height_mm=500), dict(width_mm=600, height_mm=300)])
    stock = [remnant("small", 800, 600), remnant("large", 1200, 800)]
    p = plan_order(o, stock, Settings(solver_time_limit_sec=2))
    assert p.solver_status == "OPTIMAL"
    assert p.baseline.metrics.used_remnant_count == 2
    assert p.selected.metrics.used_remnant_count == 1
    assert p.comparison.gain_vs_greedy_mm2 == 0


def test_full_30_scenario_regression_real_solver():
    from app.demo.scenarios import scenarios
    from app.services.qualification import qualify
    for scenario in scenarios():
        plan = plan_order(scenario.order, scenario.remnants, Settings(solver_time_limit_sec=1, solver_random_seed=scenario.seed))
        eligible, _ = qualify(scenario.remnants)
        pieces = expand_order(scenario.order)
        for result in (plan.baseline, plan.selected):
            validate_layout(result.placements, pieces, eligible, result.unallocated)
        assert plan.solver_metadata.selected_objective >= plan.solver_metadata.baseline_objective
        assert plan.solver_metadata.raw_solver_status not in ("ERROR", "MODEL_INVALID", "INFEASIBLE")


def test_objective_prefers_area_before_unit_count():
    # A 4x4 sheet can fit one 4x4 unit (area 16) OR two 4x1 strips (area 8), not both.
    o = order([dict(width_mm=4, height_mm=4), dict(width_mm=4, height_mm=1, quantity=2)])
    stock = [remnant(w=4, h=4)]
    p = plan_order(o, stock, Settings(solver_time_limit_sec=2))
    assert p.solver_status == "OPTIMAL"
    assert p.selected.metrics.reuse_area_mm2 == 16
    assert p.selected.metrics.placed_count == 1


def test_objective_prefers_count_when_area_equal():
    # Area 16 can come from one full square OR two half panels; two units win on count.
    o = order([dict(width_mm=4, height_mm=4), dict(width_mm=4, height_mm=2, quantity=2)])
    stock = [remnant(w=4, h=4)]
    p = plan_order(o, stock, Settings(solver_time_limit_sec=2))
    assert p.solver_status == "OPTIMAL"
    assert p.selected.metrics.reuse_area_mm2 == 16
    assert p.selected.metrics.placed_count == 2
    assert p.baseline.metrics.placed_count == 1
