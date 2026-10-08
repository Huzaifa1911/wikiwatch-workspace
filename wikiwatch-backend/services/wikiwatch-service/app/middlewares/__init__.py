import logging
import time
from collections import defaultdict, deque
from uuid import uuid4

from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.settings import settings


def register_middlewares(app):
    attempts = defaultdict(deque)

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
        return await call_next(request)

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
