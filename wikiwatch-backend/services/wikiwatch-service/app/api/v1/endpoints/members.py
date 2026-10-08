from fastapi import APIRouter, Depends, Query

from app.core.database import get_db
from app.core.enums import Role
from app.dependencies import current_member
from app.models import Member
from app.schemas.base import Page, SuccessResponse
from app.schemas.contracts import DirectoryMember, MemberCreate, MemberResponse, MemberUpdate
from app.services.members import MemberService

router = APIRouter(prefix="/members", tags=["Members"])


@router.get(
    "",
    response_model=SuccessResponse[Page[MemberResponse]],
    summary="List team members (lead or admin)",
)
async def members(
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    actor=Depends(current_member),
    db=Depends(get_db),
):
    service = MemberService(db, actor)
    service.require(Role.LEAD, Role.ADMIN)
    rows, total = await service.repo.page(Member, [], offset, limit)
    return {"data": {"items": rows, "total": total, "offset": offset, "limit": limit}}


@router.post(
    "",
    response_model=SuccessResponse[MemberResponse],
    status_code=201,
    summary="Create a member account (admin)",
    description="Create an account with a password shared separately by the trainer. This does not send an invitation email. No public signup.",
)
async def create(body: MemberCreate, actor=Depends(current_member), db=Depends(get_db)):
    return {"data": await MemberService(db, actor).create(body)}


@router.patch(
    "/{member_id}",
    response_model=SuccessResponse[MemberResponse],
    summary="Change role or active status (admin)",
    description="Cannot remove your own admin access. Unfinished claims must be reassigned or completed before reviewer access is removed.",
)
async def change(
    member_id: str, body: MemberUpdate, actor=Depends(current_member), db=Depends(get_db)
):
    return {"data": await MemberService(db, actor).change(member_id, body)}


@router.get(
    "/directory",
    response_model=SuccessResponse[Page[DirectoryMember]],
    summary="Read names for comment authors and claim owners",
    description="All roles. This directory excludes email addresses and password hashes.",
)
async def directory(
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    actor=Depends(current_member),
    db=Depends(get_db),
):
    rows, total = await MemberService(db, actor).repo.page(Member, [], offset, limit)
    return {"data": {"items": rows, "total": total, "offset": offset, "limit": limit}}
