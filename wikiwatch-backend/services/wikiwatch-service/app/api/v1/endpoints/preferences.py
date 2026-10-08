from fastapi import APIRouter, Depends

from app.core.database import get_db
from app.dependencies import current_member
from app.schemas.base import SuccessResponse
from app.schemas.contracts import PreferenceRequest, PreferenceResponse
from app.services.preferences import PreferenceService

router = APIRouter(prefix="/preferences", tags=["View preferences"])


@router.get(
    "/me",
    response_model=SuccessResponse[PreferenceResponse],
    summary="Read saved board order and viewed edits",
)
async def read(actor=Depends(current_member), db=Depends(get_db)):
    return {"data": await PreferenceService(db, actor).read()}


@router.put(
    "/me",
    response_model=SuccessResponse[PreferenceResponse],
    summary="Save board order and viewed edits",
    description="Reordering columns changes presentation only. It does not change review states. A stale version returns 409.",
)
async def save(body: PreferenceRequest, actor=Depends(current_member), db=Depends(get_db)):
    return {"data": await PreferenceService(db, actor).save(body)}
