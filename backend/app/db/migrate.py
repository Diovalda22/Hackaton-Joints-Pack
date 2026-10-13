"""Explicit, repeatable SQLite migration with an online SQLite backup before changes."""
import argparse
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
from sqlalchemy import inspect, select
from app.db.session import make_engine, initialize_database
from app.db.transactions import write_session
from app.models.roadmap import RoadmapBase, SchemaVersion

CURRENT_VERSION = 1


def migrate(url: str, demo: bool = False):
    engine = make_engine(url)
    try:
        path = engine.url.database
        if path and path != ":memory:" and Path(path).exists():
            suffix = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f")
            with sqlite3.connect(path) as source, sqlite3.connect(f"{path}.backup-{suffix}") as target:
                source.backup(target)
        initialize_database(engine)
        if inspect(engine).has_table("schema_version"):
            with engine.connect() as conn:
                existing_version = conn.execute(select(SchemaVersion.version)).scalar()
                if existing_version is not None and existing_version != CURRENT_VERSION:
                    raise RuntimeError("Versi schema tidak dikenal; migrasi dibatalkan sebelum perubahan tabel roadmap.")
        from app.models.base import Base
        # Existing MVP tables stay intact; additional tables reference their stable identities.
        if demo:
            with engine.connect() as conn:
                has_data = any(conn.execute(table.select().limit(1)).first() is not None
                               for table in Base.metadata.sorted_tables)
                existing_demo = (inspect(engine).has_table("schema_version") and
                                 conn.execute(select(SchemaVersion.purpose)).scalar() == "SYNTHETIC_DEMO")
                if has_data and not existing_demo:
                    raise RuntimeError("Database berisi inventaris kerja; gunakan file demo baru. Tidak ada data yang dikonversi.")
        RoadmapBase.metadata.create_all(engine)
        with write_session(engine) as session:
            version = session.get(SchemaVersion, 1)
            if version and version.version != CURRENT_VERSION:
                raise RuntimeError("Versi schema tidak dikenal; migrasi dibatalkan.")
            if version is None:
                session.add(SchemaVersion(id=1, version=CURRENT_VERSION,
                                          purpose="SYNTHETIC_DEMO" if demo else "WORK"))
            elif demo and version.purpose != "SYNTHETIC_DEMO":
                raise RuntimeError("Purpose database sudah ditetapkan; gunakan file demo baru.")
    finally:
        engine.dispose()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", required=True)
    parser.add_argument("--demo", action="store_true")
    parser.add_argument("--seed", action="store_true")
    args = parser.parse_args()
    if args.seed and not args.demo:
        parser.error("--seed hanya untuk --demo")
    migrate(args.database_url, args.demo)
    if args.seed:
        from app.db.repository import SqlAlchemyRepository
        from app.demo.data import demo_data
        repo = SqlAlchemyRepository(args.database_url)
        try:
            if not repo.has_data():
                repo.seed(*demo_data())
        finally:
            repo.close()
    print("Migrasi selesai. Data existing dipertahankan.")


if __name__ == "__main__":
    main()
