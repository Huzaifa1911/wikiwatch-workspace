from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.database import get_db
from app.core.exceptions import AppError
from app.services.auth import AuthService

bearer = HTTPBearer(
    auto_error=False,
    description="Paste the access_token returned by login. Do not use the refresh token.",
)


async def identity(credentials: HTTPAuthorizationCredentials = Depends(bearer), db=Depends(get_db)):
    if not credentials:
        raise AppError(401, "Bearer token required")
    return await AuthService(db).authenticate(credentials.credentials)


async def current_member(request: Request, result=Depends(identity), db=Depends(get_db)):
    if request.method in {"POST", "PATCH", "PUT", "DELETE"}:
        from sqlalchemy import select

        from app.models import WorkspaceLock

        # Small, single-team training workload: serialize shared mutations.
        # This also guarantees events commit in cursor order on PostgreSQL.
        await db.execute(select(WorkspaceLock).where(WorkspaceLock.id == 1).with_for_update())
        await db.refresh(result[0])
        if not result[0].active:
            raise AppError(401, "Account disabled")
    return result[0]
