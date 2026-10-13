import pytest
from app.core.config import Settings
from app.main import create_app
from asgi_client import ASGIClient
from conftest import remnant


STOCK = dict(code="REM-001", material_code="cotton", color_code="black", width_mm=1000, height_mm=800)
ORDER = dict(name="Tote bag", lines=[dict(label="Panel", material_code="COTTON", color_code="BLACK",
                                        width_mm=500, height_mm=400, quantity=2, allow_rotation_90=False)])


def test_end_to_end_actual_greedy_api_with_injected_repository(client):
    r = client.post("/api/v1/remnants", json=STOCK)
    assert r.status_code == 201
    r = r.json()
    assert r["verification_status"] == "NEEDS_REVIEW" and r["lot_code"] == ""
    identity = r["id"]
    verified = client.patch(f"/api/v1/remnants/{identity}", json={"verification_status": "VERIFIED"})
    assert verified.status_code == 200
    o = client.post("/api/v1/orders", json=ORDER)
    assert o.status_code == 201
    o = o.json()
    before = client.get("/api/v1/remnants").json()
    response = client.post("/api/v1/plan-runs", json={"order_id": o["id"]})
    assert response.status_code == 201
    p = response.json()
    assert p["selected"]["metrics"]["placed_count"] == 2
    assert p["selected"]["metrics"]["reuse_area_m2"] == .4
    assert p["solver_status"] == "BASELINE_FALLBACK" and p["selected_strategy"] == "GREEDY"
    assert client.get("/api/v1/remnants").json() == before
    assert client.get(f'/api/v1/plan-runs/{p["id"]}').json() == p
    client.patch(f"/api/v1/remnants/{identity}", json={"width_mm": 999})
    assert client.get(f'/api/v1/plan-runs/{p["id"]}').json() == p
    assert client.get("/api/v1/orders").json()["items"][0]["lines"] == o["lines"]


def test_verification_reset_explicit_reverify_and_clear_optional(client):
    r = client.post("/api/v1/remnants", json=STOCK).json()
    path = f'/api/v1/remnants/{r["id"]}'
    client.patch(path, json={"verification_status": "VERIFIED"})
    assert client.patch(path, json={"source_note": "New source"}).json()["verification_status"] == "VERIFIED"
    assert client.patch(path, json={"width_mm": 999}).json()["verification_status"] == "NEEDS_REVIEW"
    assert client.patch(path, json={"width_mm": 998, "verification_status": "VERIFIED"}).json()["verification_status"] == "VERIFIED"
    assert client.patch(path, json={"lot_code": None}).json()["lot_code"] == ""
    assert client.patch(path, json={"width_mm": None}).status_code == 422
    assert client.patch(path, json={"stock_status": "ARCHIVED"}).json()["stock_status"] == "ARCHIVED"
    assert client.patch(path, json={"stock_status": "AVAILABLE"}).json()["verification_status"] == "VERIFIED"


def test_duplicates_validation_malformed_json_and_unknown_ids(client):
    client.post("/api/v1/remnants", json=STOCK)
    duplicate = client.post("/api/v1/remnants", json=STOCK)
    assert duplicate.status_code == 409 and duplicate.json()["error"]["code"] == "DUPLICATE_REMNANT_CODE"
    for value in (0, -1, 1.5, True, "500"):
        response = client.post("/api/v1/remnants", json=STOCK | {"width_mm": value})
        assert response.status_code == 422 and response.json()["error"]["details"]["field"] == "width_mm"
    malformed = client.post("/api/v1/remnants", content="{", headers={"Content-Type": "application/json"})
    assert malformed.status_code == 400 and malformed.json()["error"]["code"] == "BAD_REQUEST"
    assert client.get("/api/v1/orders/missing").status_code == 404
    assert client.get("/api/v1/plan-runs/missing").status_code == 404
    assert client.patch("/api/v1/remnants/missing", json={}).status_code == 404
    assert client.get("/unknown").json()["error"]["code"] == "NOT_FOUND"


def test_total_pieces_limit(client):
    data = dict(ORDER)
    data["lines"] = [ORDER["lines"][0] | {"quantity": 30}, ORDER["lines"][0]]
    response = client.post("/api/v1/orders", json=data)
    assert response.status_code == 422 and response.json()["error"]["code"] == "TOO_MANY_PIECES"


def test_empty_pool_returns_informative_result(client):
    o = client.post("/api/v1/orders", json=ORDER).json()
    p = client.post("/api/v1/plan-runs", json={"order_id": o["id"], "remnant_ids": []}).json()
    assert p["solver_status"] == "NO_ASSIGNABLE_PIECES"
    assert len(p["selected"]["unallocated"]) == 2
    assert p["selected"]["placements"] == []


def test_explicit_exclusions_and_pool_rules(client, repository):
    for i in range(16):
        repository.create_remnant(remnant(f"r{i}"))
    repository.create_remnant(remnant("review", verification_status="NEEDS_REVIEW"))
    o = client.post("/api/v1/orders", json=ORDER).json()
    path = "/api/v1/plan-runs"
    base = {"order_id": o["id"]}
    response = client.post(path, json=base)
    assert response.status_code == 422 and response.json()["error"]["code"] == "REMNANT_SELECTION_REQUIRED"
    assert client.post(path, json=base | {"remnant_ids": ["r0", "r0"]}).status_code == 422
    assert client.post(path, json=base | {"remnant_ids": ["missing"]}).status_code == 404
    assert client.post(path, json=base | {"remnant_ids": [f"r{i}" for i in range(16)]}).status_code == 422
    p = client.post(path, json=base | {"remnant_ids": ["r0", "review"]}).json()
    assert p["excluded_remnants"] == [{"remnant_id": "review", "reason_code": "NEEDS_REVIEW"}]
    assert all(placement["remnant_id"] == "r0" for placement in p["selected"]["placements"])


def test_filters_and_health_cors(client, repository):
    repository.create_remnant(remnant("cotton"))
    repository.create_remnant(remnant("denim", material_code="DENIM"))
    response = client.get("/api/v1/remnants?material_code=cotton&color_code=BLACK&verification_status=VERIFIED&stock_status=AVAILABLE")
    assert response.json()["total"] == 1
    response = client.get("/api/v1/health", headers={"Origin": "http://localhost:3000"})
    assert response.json()["service"] == "loopcut-backend"
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "x-request-id" in response.headers
    foreign = client.get("/api/v1/health", headers={"Origin": "https://untrusted.example"})
    assert "access-control-allow-origin" not in foreign.headers
    options = client.options("/api/v1/plan-runs", headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})
    assert options.status_code == 200


def test_payload_limit_and_internal_error_contract(repository):
    app = create_app(Settings(enable_optimizer=False, max_payload_bytes=128), repository)
    with ASGIClient(app, raise_server_exceptions=False) as client:
        response = client.post("/api/v1/orders", content="X" * 129)
        assert response.status_code == 413 and response.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"
        repository.list_orders = lambda: (_ for _ in ()).throw(RuntimeError("secret-diagnostic"))
        response = client.get("/api/v1/orders")
        assert response.status_code == 500 and response.json()["error"]["code"] == "INTERNAL_ERROR"
        assert "secret-diagnostic" not in response.text


def test_request_without_content_length_still_has_limit(repository):
    app = create_app(Settings(max_payload_bytes=128), repository)
    with ASGIClient(app) as client:
        response = client.post("/api/v1/orders", content=iter([b"a" * 100, b"a" * 100]))
        assert response.status_code == 413


def test_openapi_contains_contract_endpoints(client):
    schema = client.get("/openapi.json").json()
    for path in ("/api/v1/health", "/api/v1/remnants", "/api/v1/orders", "/api/v1/plan-runs"):
        assert path in schema["paths"]
