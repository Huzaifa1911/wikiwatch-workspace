from fastapi import APIRouter

from app.api.v1.endpoints import auth, comments, edits, health, members, preferences, reporting
from app.core.settings import settings
from app.schemas.base import ErrorResponse


def get_service_router():
    router = APIRouter(
        prefix=settings.base_path,
        responses={
            401: {"model": ErrorResponse, "description": "Session expired or invalid"},
            403: {"model": ErrorResponse, "description": "Role or ownership denied"},
            404: {"model": ErrorResponse},
            409: {"model": ErrorResponse, "description": "Conflict: reload before retry"},
            422: {"description": "Invalid request or transition reason"},
            429: {"description": "Login rate limit reached"},
        },
    )
    for module in [auth, edits, comments, members, preferences, reporting, health]:
        router.include_router(module.router)
    return router
