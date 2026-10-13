from urllib.parse import quote
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import pytest
from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session
from asgi_client import ASGIClient
from app.core.config import Settings
from app.core.errors import ApiError
from app.db.migrate import migrate
from app.db.repository import SqlAlchemyRepository
from app.main import create_app
from app.models.roadmap import ImportPreviewRecord, StockClaimRecord
from app.optimization.domain import expand_order
from app.optimization.validator import validate_layout, InvalidLayout
from app.schemas.plan import PlanRequest
from app.schemas.remnant import RemnantPatch
from app.schemas.roadmap import ExecutionCreate, ItemPatch, ReconciliationCreate, Defect
from app.services.roadmap import RoadmapService
from app.services.workspace import WorkspaceService
from conftest import remnant, order


@pytest.fixture
def demo(tmp_path):
    url = f"sqlite:///{tmp_path / 'demo.db'}"
    migrate(url, demo=True)
    repo = SqlAlchemyRepository(url)
    repo.create_remnant(remnant())
    repo.create_order(order())
    settings = Settings(enable_executions=True, enable_defects=True, enable_csv_import=True)
    yield repo, settings
    repo.close()


@pytest.fixture
def api(demo):
    repo, settings = demo
    with ASGIClient(create_app(settings, repo)) as client:
        yield client


def plan(api):
    response = api.post("/api/v1/plan-runs", json={"order_id": "o1", "solver_time_limit_sec": 1})
    assert response.status_code == 201, response.text
    return response.json()


def execution(api, plan_id):
    response = api.post("/api/v1/cut-executions", json={"plan_run_id": plan_id, "mode": "SYNTHETIC_DEMO"})
    assert response.status_code == 201, response.text
    return response.json()


def start(api, key):
    for action in ("approve", "start"):
        response = api.post(f"/api/v1/cut-executions/{key}/{action}", json={})
        assert response.status_code == 200, response.text


def outcome(api, ex, value="COMPLETED"):
    for item in ex["items"]:
        response = api.patch(f'/api/v1/cut-executions/{ex["id"]}/items/{quote(item["piece_instance_id"], safe="")}', json={"outcome": value})
        assert response.status_code == 200, response.text


def test_migration_existing_data_snapshot_backup_and_repeat(tmp_path):
    path = tmp_path / "old.db"
    url = f"sqlite:///{path}"
    repo = SqlAlchemyRepository(url)
    repo.create_remnant(remnant())
    repo.create_order(order())
    p = WorkspaceService(repo, Settings(enable_optimizer=False)).run_plan(PlanRequest(order_id="o1"))
    before = p.model_dump(mode="json")
    repo.close()
    migrate(url)
    migrate(url)
    reopened = SqlAlchemyRepository(url)
    assert reopened.get_plan(p.id).model_dump(mode="json") == before
    assert "remnant_defects" not in before["input_snapshot"]
    assert reopened.get_remnant("r1") == remnant()
    assert inspect(reopened.engine).has_table("cut_executions")
    assert len(list(tmp_path.glob("old.db.backup-*"))) == 2
    backup = sorted(tmp_path.glob("old.db.backup-*"))[0]
    restored = SqlAlchemyRepository(f"sqlite:///{backup}")
    assert restored.get_plan(p.id).model_dump(mode="json") == before
    assert restored.get_remnant("r1") == remnant()
    restored.close()
    with reopened.engine.connect() as conn:
        assert conn.execute(text("PRAGMA foreign_key_check")).all() == []
    reopened.close()
    with pytest.raises(RuntimeError):
        migrate(url, demo=True)


def test_disabled_and_real_mode_rejected(tmp_path):
    repo = SqlAlchemyRepository(f"sqlite:///{tmp_path / 'work.db'}")
    with ASGIClient(create_app(Settings(enable_executions=True), repo)) as client:
        assert client.get("/api/v1/health").json()["capabilities"]["executions"] is False
        assert client.get("/api/v1/cut-executions").status_code == 409
        assert client.post("/api/v1/cut-executions", json={"plan_run_id": "p", "mode": "OPERATOR_REPORTED"}).status_code == 422
    repo.close()


def test_execution_replay_quarantine_reconciliation_history_and_report(api, demo):
    p = plan(api)
    ex = execution(api, p["id"])
    start(api, ex["id"])
    outcome(api, ex)
    url = f'/api/v1/cut-executions/{ex["id"]}/confirm'
    confirmed = api.post(url, json={"operator_note": "Demo"})
    assert confirmed.status_code == 200, confirmed.text
    assert api.post(url, json={}).json() == confirmed.json()
    assert confirmed.json()["confirmed_reuse_area_mm2"] == p["selected"]["metrics"]["reuse_area_mm2"]
    repo, _ = demo
    assert repo.get_remnant("r1").stock_status == "QUARANTINED"
    assert api.patch("/api/v1/remnants/r1", json={"stock_status": "AVAILABLE"}).status_code == 409
    assert api.patch("/api/v1/remnants/r1", json={"width_mm": 950}).status_code == 409
    assert api.patch(f'/api/v1/cut-executions/{ex["id"]}/items/{ex["items"][0]["piece_instance_id"]}', json={"outcome": "FAILED"}).status_code == 409
    report = api.get("/api/v1/reports/summary").json()
    assert report["pending_reconciliation_count"] == 1
    assert report["confirmed_execution_count"] == 1
    assert api.get("/api/v1/reports/summary?mode=OPERATOR_REPORTED").json()["confirmed_reuse_area_m2"] == 0
    body = {"source_remnant_id": "r1", "note": "Diukur ulang", "leftovers": [
        {"code": "LEFT-1", "width_mm": 500, "height_mm": 400}]}
    reconciled = api.post(f'/api/v1/cut-executions/{ex["id"]}/reconciliations', json=body)
    assert reconciled.status_code == 201, reconciled.text
    assert api.post(f'/api/v1/cut-executions/{ex["id"]}/reconciliations', json=body).json() == reconciled.json()
    child_id = reconciled.json()["new_remnant_ids"][0]
    assert repo.get_remnant(child_id).verification_status == "NEEDS_REVIEW"
    assert repo.get_remnant("r1").stock_status == "ARCHIVED"
    assert api.get(f"/api/v1/remnants/{child_id}/history").json()["parent"]["source_remnant_id"] == "r1"
    assert api.get("/api/v1/reports/summary").json()["pending_reconciliation_count"] == 0
    assert api.get(f'/api/v1/plan-runs/{p["id"]}').json() == p


def test_state_machine_unknown_piece_pending_and_cancel(api):
    ex = execution(api, plan(api)["id"])
    root = f'/api/v1/cut-executions/{ex["id"]}'
    assert api.post(root + "/confirm", json={}).status_code == 409
    start(api, ex["id"])
    assert api.patch(root + "/items/foreign#1", json={"outcome": "COMPLETED"}).status_code == 404
    assert api.post(root + "/confirm", json={}).status_code == 409
    outcome(api, ex, "NOT_ATTEMPTED")
    assert api.post(root + "/confirm", json={}).status_code == 409
    assert api.post(root + "/cancel", json={}).json()["status"] == "CANCELLED"


def test_failed_cut_zero_area_still_claims_source_and_no_cancel(api, demo):
    ex = execution(api, plan(api)["id"])
    start(api, ex["id"])
    outcome(api, ex, "FAILED")
    assert api.post(f'/api/v1/cut-executions/{ex["id"]}/cancel', json={}).status_code == 409
    confirmed = api.post(f'/api/v1/cut-executions/{ex["id"]}/confirm', json={}).json()
    assert confirmed["confirmed_reuse_area_mm2"] == 0
    assert demo[0].get_remnant("r1").stock_status == "QUARANTINED"


def test_stale_inventory_blocks_confirmation(api):
    ex = execution(api, plan(api)["id"])
    start(api, ex["id"])
    outcome(api, ex)
    api.patch("/api/v1/remnants/r1", json={"condition_note": "Kondisi berubah"})
    assert api.post(f'/api/v1/cut-executions/{ex["id"]}/confirm', json={}).status_code == 409


def test_concurrent_confirmation_only_one_wins(demo):
    repo, settings = demo
    service = RoadmapService(repo, settings)
    p = WorkspaceService(repo, settings).run_plan(PlanRequest(order_id="o1", solver_time_limit_sec=1))
    executions = [service.create_execution(ExecutionCreate(plan_run_id=p.id, mode="SYNTHETIC_DEMO")) for _ in range(2)]
    for ex in executions:
        service.transition(ex["id"], "approve")
        service.transition(ex["id"], "start")
        for item in ex["items"]:
            service.patch_item(ex["id"], item["piece_instance_id"], ItemPatch(outcome="COMPLETED"))
    def confirm(ex):
        try:
            return service.transition(ex["id"], "confirm")["status"]
        except ApiError as exc:
            return exc.code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(confirm, executions)) == ["CONFIRMED", "CONFLICT"]
    with Session(repo.engine) as session:
        assert len(list(session.scalars(select(StockClaimRecord)))) == 1


def test_reconciliation_rollback_and_invalid_area(api, demo):
    ex = execution(api, plan(api)["id"])
    start(api, ex["id"])
    outcome(api, ex)
    api.post(f'/api/v1/cut-executions/{ex["id"]}/confirm', json={})
    root = f'/api/v1/cut-executions/{ex["id"]}/reconciliations'
    duplicate = {"source_remnant_id": "r1", "leftovers": [
        {"code": "NEW", "width_mm": 100, "height_mm": 100},
        {"code": "r1", "width_mm": 100, "height_mm": 100}]}
    assert api.post(root, json=duplicate).status_code == 409
    assert len(demo[0].list_remnants()) == 1
    assert demo[0].get_remnant("r1").stock_status == "QUARANTINED"
    assert api.post(root, json={"source_remnant_id": "r1", "leftovers": [
        {"code": "HUGE", "width_mm": 1000, "height_mm": 1000}]}).status_code == 422
    assert api.post(root, json={"source_remnant_id": "r1", "leftovers": []}).status_code == 201


def test_defect_review_bounds_overlap_snapshot_and_stale_approval(api, demo):
    original = plan(api)
    before = demo[0].get_remnant("r1")
    zone = {"x_mm": 0, "y_mm": 0, "width_mm": 400, "height_mm": 1000, "defect_type": "TEAR"}
    def replace(zones, timestamp=before.updated_at.isoformat()):
        return api.patch("/api/v1/remnants/r1/defects", json={"expected_updated_at": timestamp, "defects": zones})
    assert replace([zone, zone]).status_code == 422
    assert replace([zone | {"width_mm": 1001}]).status_code == 422
    assert replace([zone]).status_code == 200
    assert demo[0].get_remnant("r1").verification_status == "NEEDS_REVIEW"
    assert api.patch("/api/v1/remnants/r1", json={"width_mm": 300}).status_code == 422
    assert replace([]).status_code == 409
    api.patch("/api/v1/remnants/r1", json={"verification_status": "VERIFIED"})
    old_execution = execution(api, original["id"])
    assert api.post(f'/api/v1/cut-executions/{old_execution["id"]}/approve', json={}).status_code == 409
    current = plan(api)
    assert "remnant_defects" in current["input_snapshot"]
    assert all(p["x_mm"] >= 400 for p in current["selected"]["placements"])
    assert api.get(f'/api/v1/plan-runs/{original["id"]}').json() == original


def test_concurrent_inventory_edit_cannot_reverify_new_defects(api, demo):
    repo = demo[0]
    before = repo.get_remnant("r1")
    response = api.patch("/api/v1/remnants/r1/defects", json={"expected_updated_at": before.updated_at.isoformat(),
        "defects": [{"x_mm": 0, "y_mm": 0, "width_mm": 100, "height_mm": 100, "defect_type": "HOLE"}]})
    assert response.status_code == 200
    stale = before.model_copy(update={"source_note": "Concurrent note", "updated_at": datetime.now(timezone.utc)})
    with pytest.raises(ApiError) as exc:
        repo.update_remnant_if_current(stale, before.updated_at)
    assert exc.value.status == 409
    assert repo.get_remnant("r1").verification_status == "NEEDS_REVIEW"


@pytest.mark.parametrize("case", range(10))
def test_ten_seeded_defect_scenarios(case):
    from app.demo.scenarios import defect_scenarios
    scenario = defect_scenarios()[case]
    stock, o, zones = scenario.remnants, scenario.order, scenario.defects
    from app.services.planning import plan_order
    p = plan_order(o, stock, Settings(solver_random_seed=20261013 + case), time_limit_sec=1, defects=zones)
    for result in (p.baseline, p.selected):
        validate_layout(result.placements, expand_order(o), stock, result.unallocated, zones)
    assert p.selected.metrics.reuse_area_mm2 >= p.baseline.metrics.reuse_area_mm2


def test_defect_edge_rotation_and_fully_blocked():
    from app.services.planning import plan_order
    r = remnant(w=400, h=1000)
    o = order([{"width_mm": 800, "height_mm": 300, "quantity": 1, "allow_rotation_90": True}])
    zones = {"r1": [Defect(id="d", remnant_id="r1", x_mm=300, y_mm=0, width_mm=100, height_mm=1000, defect_type="TEAR")]}
    p = plan_order(o, [r], Settings(), 1, defects=zones)
    assert p.selected.placements[0].rotated
    assert p.selected.placements[0].x_mm == 0
    invalid = p.selected.placements[0].model_copy(update={"x_mm": 1})
    with pytest.raises(InvalidLayout):
        validate_layout([invalid], expand_order(o), [r], defects=zones)
    zones["r1"][0] = zones["r1"][0].model_copy(update={"x_mm": 0, "width_mm": 400})
    blocked = plan_order(o, [r], Settings(), 1, defects=zones)
    assert not blocked.selected.placements
    assert blocked.selected.unallocated[0].reason_code == "BLOCKED_BY_DEFECT"


HEADER = "code,lot_code,material_code,color_code,width_mm,height_mm,quantity,condition_note\n"


def test_csv_100_sheets_review_verification_and_idempotency(api, demo):
    preview = api.post("/api/v1/remnants/import-preview", json={"csv_text": HEADER + "BATCH,LOT,COTTON,BLACK,500,400,100,diukur\n"}).json()
    assert preview["sheet_count"] == 100 and preview["can_commit"]
    assert preview["items"][0]["code"] == "BATCH-001"
    body = {"preview_token": preview["preview_token"]}
    committed = api.post("/api/v1/remnants/import-commit", json=body).json()
    assert len(committed["remnant_ids"]) == 100
    replay = api.post("/api/v1/remnants/import-commit", json=body).json()
    assert replay["remnant_ids"] == committed["remnant_ids"] and replay["replayed"]
    repo = demo[0]
    imported = [repo.get_remnant(key) for key in committed["remnant_ids"]]
    assert all(r.verification_status == "NEEDS_REVIEW" for r in imported)
    verified = api.post("/api/v1/remnants/bulk-verify", json={"inspected": True, "items": [
        {"id": r.id, "expected_updated_at": r.updated_at.isoformat()} for r in imported]})
    assert verified.status_code == 200, verified.text
    assert repo.get_remnant(imported[0].id).verification_status == "VERIFIED"


def test_csv_errors_conflict_expiry_and_atomic_verify(api, demo):
    invalid = api.post("/api/v1/remnants/import-preview", json={"csv_text": HEADER + "r1,,COTTON,BLACK,100,100,1,\nBAD,,COTTON,BLACK,0,100,1,\n"}).json()
    assert len(invalid["errors"]) == 2 and not invalid["can_commit"]
    assert api.post("/api/v1/remnants/import-commit", json={"preview_token": invalid["preview_token"]}).status_code == 409
    csv_text = HEADER + "NEW,,COTTON,BLACK,100,100,1,\nCOLLIDE,,COTTON,BLACK,100,100,1,\n"
    preview = api.post("/api/v1/remnants/import-preview", json={"csv_text": csv_text}).json()
    demo[0].create_remnant(remnant("collision", code="COLLIDE"))
    assert api.post("/api/v1/remnants/import-commit", json={"preview_token": preview["preview_token"]}).status_code == 409
    assert all(r.code != "NEW" for r in demo[0].list_remnants())
    with Session(demo[0].engine) as session, session.begin():
        session.get(ImportPreviewRecord, preview["preview_token"]).expires_at = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    assert api.post("/api/v1/remnants/import-commit", json={"preview_token": preview["preview_token"]}).status_code == 409
    first, second = demo[0].get_remnant("r1"), demo[0].get_remnant("collision")
    api.patch("/api/v1/remnants/collision", json={"width_mm": 900})
    api.patch("/api/v1/remnants/r1", json={"verification_status": "NEEDS_REVIEW"})
    first = demo[0].get_remnant("r1")
    result = api.post("/api/v1/remnants/bulk-verify", json={"inspected": True, "items": [
        {"id": r.id, "expected_updated_at": r.updated_at.isoformat()} for r in (first, second)]})
    assert result.status_code == 409
    assert demo[0].get_remnant("r1").verification_status == "NEEDS_REVIEW"
