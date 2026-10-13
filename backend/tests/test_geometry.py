import pytest
from app.optimization.domain import expand_order
from app.optimization.greedy import greedy
from app.optimization.metrics import result_for, objective
from app.optimization.validator import InvalidLayout, validate_layout
from app.optimization.compatibility import orientations
from app.schemas.plan import Placement
from conftest import order, remnant


def test_greedy_is_deterministic_and_units_unique():
    pieces, stock = expand_order(order()), [remnant()]
    a, b = greedy(pieces, stock), greedy(list(reversed(pieces)), list(reversed(stock)))
    assert a == b
    result = result_for(a, pieces, stock)
    validate_layout(a, pieces, stock, result.unallocated)
    assert result.metrics.reuse_area_mm2 == 400000
    assert result.metrics.reuse_area_m2 == .4
    assert result.metrics.placed_count == 2
    assert {p.piece_instance_id for p in a} == {"l0#1", "l0#2"}


def test_exact_fit_and_touching_edges_are_valid():
    pieces = expand_order(order([dict(width_mm=500, height_mm=1000, quantity=2)]))
    stock = [remnant()]
    placements = greedy(pieces, stock)
    assert len(placements) == 2
    assert placements[0].x_mm == 0 and placements[1].x_mm == 500
    validate_layout(placements, pieces, stock)


@pytest.mark.parametrize("allowed,expected", [(True, 1), (False, 0)])
def test_rotation_only_when_allowed(allowed, expected):
    pieces = expand_order(order([dict(width_mm=900, height_mm=400, allow_rotation_90=allowed)]))
    stock = [remnant(w=400, h=900)]
    placements = greedy(pieces, stock)
    assert len(placements) == expected
    if placements:
        assert placements[0].rotated and placements[0].placed_width_mm == 400 and placements[0].placed_height_mm == 900
        validate_layout(placements, pieces, stock)


def test_square_does_not_duplicate_orientation():
    piece = expand_order(order([dict(width_mm=400, height_mm=400, allow_rotation_90=True)]))[0]
    assert len(orientations(piece, remnant())) == 1


@pytest.mark.parametrize("mutation", ["duplicate", "overlap", "bounds", "orientation", "material", "unknown", "noninteger"])
def test_independent_validator_rejects_invalid_layout(mutation):
    pieces, stock = expand_order(order()), [remnant()]
    placements = greedy(pieces, stock)
    if mutation == "duplicate":
        placements[1] = placements[0]
    elif mutation == "overlap":
        placements[1] = placements[1].model_copy(update={"x_mm": 0, "y_mm": 0})
    elif mutation == "bounds":
        placements[0] = placements[0].model_copy(update={"x_mm": 9000})
    elif mutation == "orientation":
        placements[0] = placements[0].model_copy(update={"rotated": True})
    elif mutation == "material":
        stock[0] = stock[0].model_copy(update={"material_code": "DENIM"})
    elif mutation == "unknown":
        placements[0] = placements[0].model_copy(update={"piece_instance_id": "other#1"})
    else:
        placements[0] = placements[0].model_copy(update={"x_mm": 1.5})
    with pytest.raises(InvalidLayout):
        validate_layout(placements, pieces, stock)


def test_validator_partition():
    pieces, stock = expand_order(order()), [remnant()]
    placements = greedy(pieces, stock)[:1]
    with pytest.raises(InvalidLayout):
        validate_layout(placements, pieces, stock, [])


def test_lexicographic_priority():
    pieces, stock = expand_order(order()), [remnant()]
    full = result_for(greedy(pieces, stock), pieces, stock)
    fewer = result_for(full.placements[:1], pieces, stock)
    assert objective(full, 2, 15) > objective(fewer, 2, 15)
    # For equal area/count, using one fewer sheet increases score by one.
    other = full.model_copy(deep=True)
    other.metrics.used_remnant_count += 1
    assert objective(full, 2, 15) == objective(other, 2, 15) + 1
