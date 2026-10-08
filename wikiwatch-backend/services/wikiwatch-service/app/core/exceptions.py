from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, OperationalError, TimeoutError


class AppError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


def register_exception_handlers(app: FastAPI):
    @app.exception_handler(AppError)
    async def app_error(_: Request, error: AppError):
        return JSONResponse(status_code=error.status, content={"error": error.message})

    @app.exception_handler(TimeoutError)
    @app.exception_handler(OperationalError)
    async def busy(_: Request, error):
        return JSONResponse(
            status_code=503,
            content={"error": "Database busy or unavailable. Retry shortly."},
            headers={"Retry-After": "5"},
        )

    @app.exception_handler(IntegrityError)
    async def conflict(_: Request, error: IntegrityError):
        return JSONResponse(
            status_code=409,
            content={"error": "Concurrent change or duplicate record. Reload and retry."},
        )
