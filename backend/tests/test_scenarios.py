from app.demo.scenarios import scenarios
from app.demo.data import demo_data
from app.core.config import Settings
from app.services.planning import plan_order
from app.services.qualification import qualify
from app.optimization.domain import expand_order
from app.optimization.validator import validate_layout


def test_seed_inputs_do_not_encode_solver_results():
    stock, orders = demo_data()
    assert len(stock) == len(orders) == 7
    assert len({r.id for r in stock}) == 7
    assert all("solver_status" not in o.model_dump() for o in orders)


def test_thirty_seeded_baselines_are_reproducible_and_valid():
    first, second = scenarios(), scenarios()
    assert len(first) == 30 and [s.as_dict() for s in first] == [s.as_dict() for s in second]
    assert len({s.seed for s in first}) == 30
    for scenario in first:
        plan = plan_order(scenario.order, scenario.remnants, Settings(enable_optimizer=False))
        eligible, _ = qualify(scenario.remnants)
        pieces = expand_order(scenario.order)
        for result in (plan.baseline, plan.selected):
            validate_layout(result.placements, pieces, eligible, result.unallocated)
        assert plan.solver_metadata.raw_solver_status == "SKIPPED"
