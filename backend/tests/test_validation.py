import pytest
from pydantic import ValidationError
from app.schemas.remnant import RemnantCreate
from app.schemas.order import OrderCreate
from app.schemas.plan import PlanRequest


INPUT = dict(code="REM-001", material_code="cotton", color_code=" black ", width_mm=1000, height_mm=800)


@pytest.mark.parametrize("value", [0, -1, 10001, 1.5, 1.0, True, "500", None])
def test_dimensions_are_strict_bounded_integers(value):
    with pytest.raises(ValidationError):
        RemnantCreate(**(INPUT | {"width_mm": value}))


def test_codes_and_optional_text():
    r = RemnantCreate(**INPUT)
    assert r.material_code == "COTTON" and r.color_code == "BLACK"
    assert r.lot_code == r.condition_note == r.source_note == ""
    for color in ("", "BLACK/WHITE", "X" * 65):
        with pytest.raises(ValidationError):
            RemnantCreate(**(INPUT | {"color_code": color}))


def test_create_cannot_self_verify_or_supply_server_id():
    for patch in ({"id": "x"}, {"verification_status": "VERIFIED"}, {"quantity": 3}):
        with pytest.raises(ValidationError):
            RemnantCreate(**(INPUT | patch))


@pytest.mark.parametrize("quantity", [0, 31, 1.5, True, "2"])
def test_quantity_rejected(quantity):
    with pytest.raises(ValidationError):
        OrderCreate(name="Order", lines=[dict(label="Panel", material_code="COTTON", color_code="BLACK",
                                            width_mm=1, height_mm=1, quantity=quantity)])


def test_order_has_at_least_one_line_and_allows_nonfitting_dimensions():
    with pytest.raises(ValidationError):
        OrderCreate(name="Order", lines=[])
    assert OrderCreate(name="Order", lines=[dict(label="Panel", material_code="COTTON", color_code="BLACK",
                                                width_mm=10000, height_mm=10000, quantity=1)]).lines[0].width_mm == 10000


@pytest.mark.parametrize("limit", [0, 9, True, 1.5, "8"])
def test_solver_limit_strict(limit):
    with pytest.raises(ValidationError):
        PlanRequest(order_id="o", solver_time_limit_sec=limit)


def test_explicit_pool_limit():
    with pytest.raises(ValidationError):
        PlanRequest(order_id="o", remnant_ids=[str(i) for i in range(16)])
    assert PlanRequest(order_id="o", remnant_ids=[]).remnant_ids == []
