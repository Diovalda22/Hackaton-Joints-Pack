"""Test-only bridge for the TypeScript HTTP adapter; uses the actual SQLite repository and CP-SAT.

Reads one request from stdin, invokes FastAPI through ASGI, and writes the HTTP
response as JSON. It never binds a TCP port and is not an application endpoint.
"""
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from asgi_client import ASGIClient
from app.core.config import Settings
from app.db.repository import SqlAlchemyRepository
from app.main import create_app
from sqlalchemy import inspect


def main():
    request = json.loads(sys.stdin.readline())
    repo = SqlAlchemyRepository(f"sqlite:///{request['database_path']}")
    try:
        extended = request.get("roadmap", False)
        if extended and not inspect(repo.engine).has_table("schema_version"):
            from app.db.migrate import migrate
            migrate(f"sqlite:///{request['database_path']}", demo=True)
        app = create_app(Settings(enable_optimizer=True, solver_time_limit_sec=2,
                                 enable_executions=extended, enable_defects=extended, enable_csv_import=extended), repo)
        kwargs = {"headers": request.get("headers", {})}
        if request.get("body") is not None:
            kwargs["content"] = request["body"]
        with ASGIClient(app) as client:
            response = client.request(request["method"], request["path"], **kwargs)
        print(json.dumps({"status": response.status_code, "body": response.json(), "headers": dict(response.headers)}))
    finally:
        repo.close()


if __name__ == "__main__":
    main()
