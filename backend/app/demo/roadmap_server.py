"""Start roadmap demo explicitly; never points at the MVP working database."""
import argparse
from pathlib import Path
import uvicorn
from app.core.config import Settings
from app.db.repository import SqlAlchemyRepository
from app.services.roadmap import roadmap_available
from app.main import create_app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=Path(__file__).resolve().parents[2] / "loopcut-roadmap-demo.db")
    parser.add_argument("--port", type=int, default=8101)
    args = parser.parse_args()
    if not args.database.is_file():
        parser.error("Database demo belum ada. Jalankan app.db.migrate --demo --seed sesuai README.")
    url = f"sqlite:///{args.database.resolve()}"
    repo = SqlAlchemyRepository(url)
    try:
        if not roadmap_available(repo):
            parser.error("Database bukan demo roadmap yang telah dimigrasikan; inventaris kerja tidak diaktifkan.")
    finally:
        repo.close()
    settings = Settings(database_url=url, enable_executions=True, enable_defects=True, enable_csv_import=True,
                        cors_origins=("http://localhost:3001", "http://127.0.0.1:3001"))
    uvicorn.run(create_app(settings), host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
