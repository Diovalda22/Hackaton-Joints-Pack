import pytest
pytest.importorskip("sqlalchemy", reason="SQLAlchemy belum tersedia; pengujian database nyata memerlukan requirements.")
from asgi_client import ASGIClient
from sqlalchemy import text
from app.core.config import Settings
from app.db.repository import SqlAlchemyRepository
from app.main import create_app
from app.demo.data import demo_data
from app.core.errors import ApiError
from app.schemas.remnant import RemnantPatch
from app.services.workspace import WorkspaceService
from conftest import remnant, order

pytestmark = pytest.mark.database


def test_persistence_restart_snapshot_and_no_consumption(tmp_path):
    url = f"sqlite:///{tmp_path / 'workspace.db'}"
    repo = SqlAlchemyRepository(url)
    repo.create_remnant(remnant())
    repo.create_order(order())
    service = WorkspaceService(repo, Settings(enable_optimizer=False))
    from app.schemas.plan import PlanRequest
    plan = service.run_plan(PlanRequest(order_id="o1"))
    before = repo.get_remnant("r1")
    assert before == remnant()
    service.update_remnant("r1", RemnantPatch(width_mm=999))
    repo.close()
    reopened = SqlAlchemyRepository(url)
    assert reopened.get_plan(plan.id).model_dump(mode="json") == plan.model_dump(mode="json")
    assert reopened.get_remnant("r1").verification_status == "NEEDS_REVIEW"
    assert reopened.get_order("o1").lines == order().lines
    reopened.close()


def test_database_constraints_and_transaction_rollback(tmp_path):
    repo = SqlAlchemyRepository(f"sqlite:///{tmp_path / 'workspace.db'}")
    repo.create_remnant(remnant())
    with pytest.raises(ApiError) as exc:
        repo.create_remnant(remnant("other", code="r1"))
    assert exc.value.code == "DUPLICATE_REMNANT_CODE"
    invalid = order()
    # A separate order with a repeated line ID forces a partial-insert rollback.
    invalid.lines.append(invalid.lines[0].model_copy(deep=True))
    with pytest.raises(Exception):
        repo.create_order(invalid)
    assert repo.list_orders() == []
    with repo.engine.connect() as conn:
        assert conn.execute(text("PRAGMA foreign_keys")).scalar() == 1
    repo.close()


def test_seed_requires_explicit_reset_and_only_stores_inputs(tmp_path):
    repo = SqlAlchemyRepository(f"sqlite:///{tmp_path / 'workspace.db'}")
    stock, orders = demo_data()
    repo.seed(stock, orders)
    assert len(repo.list_remnants()) == 7 and len(repo.list_orders()) == 7
    with pytest.raises(ApiError):
        repo.seed(stock, orders)
    repo.seed(stock, orders, reset=True)
    with repo.engine.connect() as conn:
        assert conn.execute(text("SELECT COUNT(*) FROM plan_runs")).scalar() == 0
    repo.close()


def test_api_real_database_end_to_end(tmp_path):
    repo = SqlAlchemyRepository(f"sqlite:///{tmp_path / 'workspace.db'}")
    app = create_app(Settings(enable_optimizer=False), repo)
    with ASGIClient(app) as client:
        stock = remnant().model_dump(mode="json")
        stock = {k: v for k, v in stock.items() if k not in ("id", "created_at", "updated_at", "verification_status", "stock_status")}
        r = client.post("/api/v1/remnants", json=stock)
        assert r.status_code == 201
        client.patch(f'/api/v1/remnants/{r.json()["id"]}', json={"verification_status": "VERIFIED"})
        o = order().model_dump(mode="json")
        body = {"name": o["name"], "lines": [{k: v for k, v in line.items() if k != "id"} for line in o["lines"]]}
        o = client.post("/api/v1/orders", json=body)
        assert o.status_code == 201
        p = client.post("/api/v1/plan-runs", json={"order_id": o.json()["id"]})
        assert p.status_code == 201
        assert client.get(f'/api/v1/plan-runs/{p.json()["id"]}').json() == p.json()
    repo.close()
