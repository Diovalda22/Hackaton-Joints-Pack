from datetime import datetime, timezone
import pytest
from app.core.config import Settings
from app.core.errors import ApiError
from app.schemas.remnant import Remnant
from app.schemas.order import Order, OrderLine

NOW = datetime(2026, 10, 13, tzinfo=timezone.utc)


def remnant(identity="r1", w=1000, h=1000, **changes):
    return Remnant.model_validate(dict(id=identity, code=identity, material_code="COTTON", color_code="BLACK",
                                      width_mm=w, height_mm=h, verification_status="VERIFIED", stock_status="AVAILABLE",
                                      created_at=NOW, updated_at=NOW) | changes)


def order(specs=None, identity="o1"):
    specs = specs or [dict(width_mm=500, height_mm=400, quantity=2)]
    lines = [OrderLine.model_validate(dict(id=f"l{i}", label=f"Panel {i}", material_code="COTTON", color_code="BLACK",
                                          allow_rotation_90=False, quantity=1) | spec) for i, spec in enumerate(specs)]
    return Order(id=identity, name="Pesanan uji", lines=lines, created_at=NOW, updated_at=NOW)


class MemoryRepository:
    """Test double for service/API isolation. It does NOT verify the SQLAlchemy adapter."""
    def __init__(self):
        self.remnants, self.orders, self.plans = {}, {}, {}

    @staticmethod
    def _get(values, identity):
        if identity not in values:
            raise ApiError("NOT_FOUND", "Data tidak ditemukan.", 404)
        return values[identity].model_copy(deep=True)

    def list_remnants(self):
        return [r.model_copy(deep=True) for r in self.remnants.values()]

    def get_remnant(self, identity):
        return self._get(self.remnants, identity)

    def create_remnant(self, r):
        if any(existing.code == r.code for existing in self.remnants.values()):
            raise ApiError("DUPLICATE_REMNANT_CODE", "Kode kain sudah digunakan.", 409, {"field": "code"})
        self.remnants[r.id] = r.model_copy(deep=True)
        return r

    def update_remnant(self, r):
        if any(existing.id != r.id and existing.code == r.code for existing in self.remnants.values()):
            raise ApiError("DUPLICATE_REMNANT_CODE", "Kode kain sudah digunakan.", 409, {"field": "code"})
        self.remnants[r.id] = r.model_copy(deep=True)
        return r

    def list_orders(self):
        return [o.model_copy(deep=True) for o in self.orders.values()]

    def get_order(self, identity):
        return self._get(self.orders, identity)

    def create_order(self, o):
        self.orders[o.id] = o.model_copy(deep=True)
        return o

    def save_plan(self, p):
        self.plans[p.id] = p.model_copy(deep=True)
        return p

    def get_plan(self, identity):
        return self._get(self.plans, identity)


@pytest.fixture
def repository():
    return MemoryRepository()


@pytest.fixture
def client(repository):
    from asgi_client import ASGIClient
    from app.main import create_app
    with ASGIClient(create_app(Settings(enable_optimizer=False), repository=repository)) as client:
        yield client
