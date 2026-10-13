from sqlalchemy import create_engine, event, inspect
from sqlalchemy.pool import StaticPool
from app.models.base import Base
from app.models.remnant import RemnantRecord  # noqa: F401
from app.models.order import OrderRecord, OrderLineRecord  # noqa: F401
from app.models.plan_run import PlanRunRecord  # noqa: F401


def make_engine(url: str):
    if not url.startswith("sqlite:"):
        raise ValueError("MVP menggunakan database SQLite.")
    options = {"connect_args": {"check_same_thread": False, "timeout": 10}}
    if url in ("sqlite://", "sqlite:///:memory:"):
        options["poolclass"] = StaticPool
    engine = create_engine(url, **options)

    @event.listens_for(engine, "connect")
    def configure(connection, _):
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=10000")
        cursor.close()
    return engine


def initialize_database(engine) -> None:
    # create_all never drops data. Refuse an incompatible existing schema instead of guessing migrations.
    inspector = inspect(engine)
    for name, table in Base.metadata.tables.items():
        if inspector.has_table(name):
            actual = {c["name"] for c in inspector.get_columns(name)}
            if not set(table.columns.keys()) <= actual:
                raise RuntimeError(f"Schema {name} tidak kompatibel. Backup dan migrasikan database secara eksplisit.")
    Base.metadata.create_all(engine)
