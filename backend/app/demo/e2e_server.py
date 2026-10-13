"""Run a real API on an isolated disposable SQLite database for browser tests."""
from pathlib import Path
from tempfile import TemporaryDirectory
import importlib.util
import argparse
import uvicorn
from app.core.config import Settings
from app.main import create_app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--roadmap", action="store_true")
    parser.add_argument("--port", type=int, default=8100)
    args = parser.parse_args()
    if any(importlib.util.find_spec(name) is None for name in ("sqlalchemy", "ortools")):
        raise SystemExit("E2E HTTP memerlukan SQLAlchemy dan OR-Tools. Install requirements-dev.txt dahulu.")
    with TemporaryDirectory(prefix="loopcut-e2e-") as directory:
        url = f"sqlite:///{Path(directory) / 'e2e.db'}"
        if args.roadmap:
            from app.db.migrate import migrate
            migrate(url, demo=True)
        settings = Settings(database_url=url, enable_optimizer=True, enable_executions=args.roadmap,
                            enable_defects=args.roadmap, enable_csv_import=args.roadmap,
                            cors_origins=("http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001"))
        uvicorn.run(create_app(settings), host="127.0.0.1", port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
