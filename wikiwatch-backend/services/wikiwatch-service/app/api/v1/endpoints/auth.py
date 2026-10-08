from fastapi import APIRouter, Depends

from app.core.database import get_db
from app.dependencies import current_member, identity
from app.schemas.base import SuccessResponse
from app.schemas.contracts import (
    LoginRequest,
    LogoutResponse,
    MemberResponse,
    RefreshRequest,
    Tokens,
)
from app.services.auth import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/login", response_model=SuccessResponse[Tokens], summary="Log in with email and password"
)
async def login(body: LoginRequest, db=Depends(get_db)):
    return {"data": await AuthService(db).login(body)}


@router.post(
    "/refresh",
    response_model=SuccessResponse[Tokens],
    summary="Rotate refresh and access tokens",
    description="Each refresh token can be used once. Old access token is revoked too. Serialize refresh requests in the frontend.",
)
async def refresh(body: RefreshRequest, db=Depends(get_db)):
    return {"data": await AuthService(db).refresh(body.refresh_token.get_secret_value())}


@router.post(
    "/logout", response_model=SuccessResponse[LogoutResponse], summary="Revoke the current session"
)
async def logout(result=Depends(identity), db=Depends(get_db)):
    result[1].revoked = True
    await db.commit()
    return {"data": {"logged_out": True}}


@router.get(
    "/me",
    response_model=SuccessResponse[MemberResponse],
    summary="Read the current account and role",
)
async def me(actor=Depends(current_member)):
    return {"data": actor}
