from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse
from app.api import health, remnants, orders, plan_runs, roadmap
from app.core.config import Settings
from app.core.errors import ApiError
from app.core.middleware import PayloadLimitMiddleware, RequestLogMiddleware
from app.db.contracts import Repository
from app.services.planning import Solver


def create_app(settings: Settings | None = None, repository: Repository | None = None,
               solver: Solver | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    logging.basicConfig(level=getattr(logging, settings.log_level, logging.INFO))

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        owned = repository is None
        if owned:
            try:
                from app.db.repository import SqlAlchemyRepository
            except ImportError as exc:
                raise RuntimeError("SQLAlchemy belum terpasang. Jalankan pip install -r requirements-dev.txt.") from exc
            application.state.repository = SqlAlchemyRepository(settings.database_url)
        try:
            yield
        finally:
            if owned:
                application.state.repository.close()

    app = FastAPI(title="LoopCut AI API", version="1.0.0", lifespan=lifespan)
    app.state.settings, app.state.repository, app.state.solver = settings, repository, solver
    for router in (health.router, roadmap.router, remnants.router, orders.router, plan_runs.router):
        app.include_router(router, prefix="/api/v1")

    @app.exception_handler(ApiError)
    async def api_error(_: Request, exc: ApiError):
        return JSONResponse(exc.body(), status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_: Request, exc: RequestValidationError):
        errors = exc.errors()
        first = errors[0]
        malformed = first["type"] == "json_invalid"
        field = ".".join(str(x) for x in first["loc"] if x not in ("body", "query", "path"))
        issue_list = [{"field": ".".join(str(x) for x in e["loc"][1:]), "message": e["msg"]} for e in errors]
        error = ApiError("BAD_REQUEST" if malformed else "VALIDATION_ERROR",
                         "JSON tidak valid." if malformed else f"Input tidak valid: {field or 'request'}.",
                         400 if malformed else 422, {"field": field, "issues": issue_list})
        return JSONResponse(error.body(), status_code=error.status)

    @app.exception_handler(HTTPException)
    async def http_error(_: Request, exc: HTTPException):
        error = ApiError("NOT_FOUND" if exc.status_code == 404 else "HTTP_ERROR",
                         "Endpoint tidak ditemukan." if exc.status_code == 404 else "Metode atau request tidak didukung.", exc.status_code)
        return JSONResponse(error.body(), status_code=error.status, headers=exc.headers)

    app.add_middleware(PayloadLimitMiddleware, maximum=settings.max_payload_bytes)
    app.add_middleware(RequestLogMiddleware)
    # CORS is outermost so even handled payload/internal errors remain readable to the frontend.
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins),
                       allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
                       allow_headers=["Content-Type"], expose_headers=["X-Request-ID"])
    return app


app = create_app()
