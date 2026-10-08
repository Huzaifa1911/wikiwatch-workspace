import asyncio
import logging
import time
from collections import defaultdict, deque
from uuid import uuid4

from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.settings import settings


def register_middlewares(app):
    attempts = defaultdict(deque)
    mutation_lock = asyncio.Lock()

    @app.middleware("http")
    async def auth_limit(request, call_next):
        if request.url.path in {
            settings.base_path + "/auth/login",
            settings.base_path + "/auth/refresh",
        }:
            # One Render instance/worker. Scale-out needs a shared limiter.
            key = request.client.host if request.client else "unknown"
            stamp = time.monotonic()
            for stale in [k for k, v in attempts.items() if not v or v[-1] < stamp - 60]:
                attempts.pop(stale, None)
            if key not in attempts and len(attempts) >= 10000:
                return JSONResponse({"error": "Too many authentication requests"}, status_code=429)
            bucket = attempts[key]
            while bucket and bucket[0] < stamp - 60:
                bucket.popleft()
            if len(bucket) >= 20 or len(attempts) > 10000:
                return JSONResponse(
                    {"error": "Too many authentication requests"},
                    status_code=429,
                    headers={"Retry-After": "60"},
                )
            bucket.append(stamp)
        if request.method in {"POST", "PATCH", "PUT", "DELETE"}:
            # One worker also serializes SQLite mutations and password hashing.
            # PostgreSQL's row locks provide the corresponding cross-worker safety.
            async with mutation_lock:
                return await call_next(request)
        return await call_next(request)

    app.add_middleware(ResourceGuard)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["X-Request-ID"],
        allow_credentials=False,
    )

    @app.middleware("http")
    async def request_log(request, call_next):
        started = time.perf_counter()
        response = await call_next(request)
        request_id = str(uuid4())
        response.headers["X-Request-ID"] = request_id
        response.headers["Cache-Control"] = "no-store"
        logging.getLogger("access").info(
            "%s %s %s %.3f %s",
            request.method,
            request.url.path,
            response.status_code,
            time.perf_counter() - started,
            request_id,
        )
        return response


class ResourceGuard:
    """Bound admission and request bodies before JSON parsing, including chunked uploads."""

    def __init__(self, app):
        self.app = app
        self.active = 0

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        if self.active >= settings.concurrent_requests:
            return await JSONResponse(
                {"error": "Server busy. Retry shortly."},
                status_code=503,
                headers={"Retry-After": "5"},
            )(scope, receive, send)
        self.active += 1
        try:
            body = bytearray()
            while True:
                try:
                    message = await asyncio.wait_for(receive(), timeout=10)
                except TimeoutError:
                    return await JSONResponse(
                        {"error": "Request upload timed out"}, status_code=408
                    )(scope, receive, send)
                if message["type"] == "http.disconnect":
                    return
                chunk = message.get("body", b"")
                if len(body) + len(chunk) > settings.request_bytes:
                    return await JSONResponse(
                        {"error": "Request body is too large"}, status_code=413
                    )(scope, receive, send)
                body.extend(chunk)
                if not message.get("more_body", False):
                    break
            delivered = False

            async def bounded_receive():
                nonlocal delivered
                if not delivered:
                    delivered = True
                    return {"type": "http.request", "body": bytes(body), "more_body": False}
                return await receive()

            await self.app(scope, bounded_receive, send)
        finally:
            self.active -= 1
