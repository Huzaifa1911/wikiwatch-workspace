from fastapi import APIRouter, Depends, Query

from app.core.database import get_db
from app.core.enums import Status
from app.dependencies import current_member
from app.models import Edit
from app.schemas.base import Page, SuccessResponse, VersionRequest
from app.schemas.contracts import (
    AdmitRequest,
    BoardResponse,
    EditResponse,
    TransitionRequest,
    WorkloadResponse,
)
from app.services.edits import EditService

router = APIRouter(tags=["Edits and claims"])


@router.post(
    "/edits/admit",
    response_model=SuccessResponse[list[EditResponse]],
    summary="Admit a bounded batch of stream edits to the shared queue",
    description="Reviewer or lead. Metadata supplied by the client is not independently verified. Same wiki/new_rev is idempotent. Do not submit the complete global firehose. Max 100 per request; queue is capped.",
)
async def admit(body: AdmitRequest, actor=Depends(current_member), db=Depends(get_db)):
    return {"data": await EditService(db, actor).admit(body)}


@router.get(
    "/edits",
    response_model=SuccessResponse[Page[EditResponse]],
    summary="Read the shared queue or a status column",
    description="All signed-in roles. Filters are applied on the server. My Claims uses owner_id from /auth/me. These are admitted team edits, not all Wikipedia edits.",
)
async def edits(
    status: Status | None = None,
    owner_id: str | None = None,
    wiki: str | None = None,
    q: str | None = Query(None, max_length=200),
    namespace: int | None = None,
    bot: bool | None = None,
    min_delta: int | None = None,
    max_delta: int | None = None,
    archived: bool = False,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    actor=Depends(current_member),
    db=Depends(get_db),
):
    conditions = [Edit.archived == archived]
    for column, value in [
        (Edit.status, status),
        (Edit.owner_id, owner_id),
        (Edit.wiki, wiki),
        (Edit.namespace, namespace),
        (Edit.bot, bot),
    ]:
        if value is not None:
            conditions.append(column == value)
    if min_delta is not None:
        conditions.append(Edit.delta >= min_delta)
    if max_delta is not None:
        conditions.append(Edit.delta <= max_delta)
    if q:
        conditions.append(Edit.title.contains(q, autoescape=True))
    rows, total = await EditService(db, actor).repo.page(Edit, conditions, offset, limit)
    return {"data": {"items": rows, "total": total, "offset": offset, "limit": limit}}


@router.get(
    "/edits/{edit_id}",
    response_model=SuccessResponse[EditResponse],
    summary="Read one edit and its current version",
)
async def edit(edit_id: str, actor=Depends(current_member), db=Depends(get_db)):
    return {"data": await EditService(db, actor).repo.get(Edit, edit_id)}


@router.post(
    "/edits/{edit_id}/transition",
    response_model=SuccessResponse[EditResponse],
    summary="Claim, review, assign, verify, return, release, or reopen",
    description="Reviewer: claim unclaimed; OK/flag/release own claimed or returned edit. Lead: assign unfinished edits; release claimed; return/verify flagged; reopen completed. Flags and returns need a reason. Version is required. 409 means reload; never show an offline claim as confirmed. A flag does not revert Wikipedia.",
)
async def transition(
    edit_id: str, body: TransitionRequest, actor=Depends(current_member), db=Depends(get_db)
):
    return {"data": await EditService(db, actor).transition(edit_id, body)}


@router.post(
    "/edits/{edit_id}/archive",
    response_model=SuccessResponse[EditResponse],
    summary="Archive unclaimed or completed edits (admin)",
)
async def archive(
    edit_id: str, body: VersionRequest, actor=Depends(current_member), db=Depends(get_db)
):
    return {"data": await EditService(db, actor).archive(edit_id, body.version)}


@router.get(
    "/board",
    response_model=SuccessResponse[BoardResponse],
    summary="Read claim-board counts (lead)",
)
async def board(actor=Depends(current_member), db=Depends(get_db)):
    return {"data": await EditService(db, actor).board()}


@router.get(
    "/workload",
    response_model=SuccessResponse[list[WorkloadResponse]],
    summary="Read reviewer workload by actual status (lead)",
)
async def workload(actor=Depends(current_member), db=Depends(get_db)):
    return {"data": await EditService(db, actor).workload()}
