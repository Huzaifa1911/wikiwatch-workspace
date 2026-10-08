from fastapi import APIRouter, Depends, Query

from app.core.database import get_db
from app.core.enums import Role
from app.core.exceptions import AppError
from app.core.settings import settings
from app.dependencies import current_member
from app.models import Thread
from app.schemas.base import Page, SuccessResponse, VersionRequest
from app.schemas.contracts import (
    CommentCreate,
    DeleteResponse,
    ReplyResponse,
    ResolveRequest,
    ThreadCreate,
    ThreadResponse,
)
from app.services.comments import CommentService

router = APIRouter(tags=["Diff comments"])


@router.get(
    "/edits/{edit_id}/threads",
    response_model=SuccessResponse[Page[ThreadResponse]],
    summary="Load persistent threads for one revision pair",
)
async def threads(
    edit_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(5, ge=1, le=5),
    actor=Depends(current_member),
    db=Depends(get_db),
):
    service = CommentService(db, actor)
    service.require(Role.REVIEWER, Role.LEAD)
    rows, total = await service.repo.page(
        Thread, [Thread.edit_id == edit_id, Thread.deleted.is_(False)], offset, limit
    )
    if total > settings.threads_per_edit:
        raise AppError(409, "Retained discussions exceed the edit limit. Export or maintain the history before loading it.")
    return {
        "data": {
            "items": [await service.response(row) for row in rows],
            "total": total,
            "offset": offset,
            "limit": limit,
        }
    }


@router.post(
    "/edits/{edit_id}/threads",
    response_model=SuccessResponse[ThreadResponse],
    status_code=201,
    summary="Start a line or selection comment thread",
    description="Reviewer or lead. Store fixed revision IDs, side, line range, UTF-16 offsets and plain-text quote. No raw HTML. Source lines are not fetched or checked by this API; frontend must detect an anchor mismatch instead of attaching it to different text.",
)
async def create(
    edit_id: str, body: ThreadCreate, actor=Depends(current_member), db=Depends(get_db)
):
    return {"data": await CommentService(db, actor).create(edit_id, body)}


@router.post(
    "/threads/{thread_id}/comments",
    response_model=SuccessResponse[ReplyResponse],
    status_code=201,
    summary="Reply to an open thread",
)
async def reply(
    thread_id: str, body: CommentCreate, actor=Depends(current_member), db=Depends(get_db)
):
    return {"data": await CommentService(db, actor).reply(thread_id, body)}


@router.patch(
    "/threads/{thread_id}",
    response_model=SuccessResponse[ThreadResponse],
    summary="Resolve or reopen a thread",
)
async def resolve(
    thread_id: str, body: ResolveRequest, actor=Depends(current_member), db=Depends(get_db)
):
    return {"data": await CommentService(db, actor).resolve(thread_id, body)}


@router.delete(
    "/threads/{thread_id}",
    response_model=SuccessResponse[DeleteResponse],
    summary="Delete your own thread and hide its replies",
    description="Soft deletion. Author only. The audit keeps a deletion record. Database rows remain for instructor retention; no other API returns their content.",
)
async def remove(
    thread_id: str, body: VersionRequest, actor=Depends(current_member), db=Depends(get_db)
):
    return {"data": await CommentService(db, actor).remove(thread_id, body.version)}
