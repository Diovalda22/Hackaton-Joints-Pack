"""In-process HTTP client; never binds a port or starts a browser.

A timer keeps the loop responsive on restricted hosts where cross-thread wakeup
notifications are unavailable. All HTTP parsing/routing still uses FastAPI ASGI.
"""
import asyncio
import contextlib
import httpx


class ASGIClient:
    def __init__(self, app, raise_server_exceptions=True):
        self.app = app
        self.raise_server_exceptions = raise_server_exceptions

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def request(self, method, path, **kwargs):
        async def run():
            async def tick():
                while True:
                    await asyncio.sleep(.005)
            heartbeat = asyncio.create_task(tick())
            content = kwargs.get("content")
            if content is not None and not isinstance(content, (str, bytes)):
                async def chunks():
                    for chunk in content:
                        yield chunk
                kwargs["content"] = chunks()
            try:
                transport = httpx.ASGITransport(app=self.app, raise_app_exceptions=self.raise_server_exceptions)
                async with self.app.router.lifespan_context(self.app):
                    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                        return await asyncio.wait_for(client.request(method, path, **kwargs), timeout=10)
            finally:
                heartbeat.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await heartbeat
        return asyncio.run(run())

    def get(self, path, **kwargs):
        return self.request("GET", path, **kwargs)

    def post(self, path, **kwargs):
        return self.request("POST", path, **kwargs)

    def patch(self, path, **kwargs):
        return self.request("PATCH", path, **kwargs)

    def options(self, path, **kwargs):
        return self.request("OPTIONS", path, **kwargs)
