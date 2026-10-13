import logging
from time import perf_counter
from uuid import uuid4
from starlette.responses import JSONResponse
from app.core.errors import ApiError

logger = logging.getLogger("loopcut.requests")


class PayloadLimitMiddleware:
    def __init__(self, app, maximum: int):
        self.app, self.maximum = app, maximum

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = dict(scope.get("headers", []))
        length = headers.get(b"content-length")
        if length is not None:
            try:
                too_large = int(length) > self.maximum
            except ValueError:
                error = ApiError("BAD_REQUEST", "Content-Length tidak valid.", 400)
                await JSONResponse(error.body(), status_code=error.status)(scope, receive, send)
                return
            if too_large:
                error = ApiError("PAYLOAD_TOO_LARGE", "Payload melebihi batas 256 KB.", 413)
                await JSONResponse(error.body(), status_code=413)(scope, receive, send)
                return
        chunks, size = [], 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            size += len(chunk)
            if size > self.maximum:
                error = ApiError("PAYLOAD_TOO_LARGE", "Payload melebihi batas 256 KB.", 413)
                await JSONResponse(error.body(), status_code=413)(scope, receive, send)
                return
            chunks.append(chunk)
            if not message.get("more_body", False):
                break
        sent = False

        async def replay():
            nonlocal sent
            if not sent:
                sent = True
                return {"type": "http.request", "body": b"".join(chunks), "more_body": False}
            return await receive()
        await self.app(scope, replay, send)


class RequestLogMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request_id = uuid4().hex
        scope.setdefault("state", {})["request_id"] = request_id
        start, status, started = perf_counter(), 500, False

        async def wrapped_send(message):
            nonlocal status, started
            if message["type"] == "http.response.start":
                started = True
                status = message["status"]
                message["headers"] = [*message.get("headers", []), (b"x-request-id", request_id.encode())]
            await send(message)
        try:
            await self.app(scope, receive, wrapped_send)
        except Exception:
            logger.exception("request_id=%s unexpected_error", request_id)
            if started:
                raise
            error = ApiError("INTERNAL_ERROR", "Terjadi kesalahan internal. Coba lagi atau periksa log server.", 500)
            await JSONResponse(error.body(), status_code=500)(scope, receive, wrapped_send)
        finally:
            logger.info("request_id=%s method=%s path=%s status=%s runtime_sec=%.4f",
                        request_id, scope["method"], scope["path"], status, perf_counter() - start)
