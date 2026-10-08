import csv
import io
from datetime import timedelta

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.database import get_db
from app.core.enums import Role
from app.core.exceptions import AppError
from app.dependencies import current_member
from app.models import Audit, Edit, Event
from app.models.entities import now
from app.schemas.base import Page, SuccessResponse
from app.schemas.contracts import ActivityResponse, AuditResponse, EventsResponse
from app.services.base import Service

router = APIRouter(tags=["Reporting and synchronization"])


@router.get(
    "/events",
    response_model=SuccessResponse[EventsResponse],
    summary="Catch up on team changes using a durable cursor",
    description="All roles. Poll while the app is visible, with backoff on failures. Events are invalidation signals, not copies of private records. Refetch allowed resources. Keep polling until has_more is false. Cursor 0 starts at the beginning. Realtime transport is REST polling, not a Wikimedia SSE proxy.",
)
async def events(
    after: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    latest: bool = False,
    actor=Depends(current_member),
    db=Depends(get_db),
):
    if latest:
        return {
            "data": {
                "items": [],
                "next_cursor": await db.scalar(select(func.max(Event.id))) or 0,
                "has_more": False,
            }
        }
    rows = list(
        (
            await db.scalars(
                select(Event).where(Event.id > after).order_by(Event.id).limit(limit + 1)
            )
        ).all()
    )
    more = len(rows) > limit
    rows = rows[:limit]
    return {
        "data": {"items": rows, "next_cursor": rows[-1].id if rows else after, "has_more": more}
    }


@router.get(
    "/audit",
    response_model=SuccessResponse[Page[AuditResponse]],
    summary="Search the append-only audit log (admin)",
)
async def audit(
    newest: bool = False,
    action: str | None = None,
    actor_id: str | None = None,
    q: str | None = Query(None, max_length=200),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    actor=Depends(current_member),
    db=Depends(get_db),
):
    service = Service(db, actor)
    service.require(Role.ADMIN)
    conditions = []
    if action:
        conditions.append(Audit.action == action)
    if actor_id:
        conditions.append(Audit.actor_id == actor_id)
    if q:
        conditions.append(
            Audit.target.contains(q, autoescape=True) | Audit.action.contains(q, autoescape=True)
        )
    rows, total = await service.repo.page(Audit, conditions, offset, limit)
    if newest:
        rows = (
            await db.scalars(
                select(Audit)
                .where(*conditions)
                .order_by(Audit.id.desc())
                .offset(offset)
                .limit(limit)
            )
        ).all()
    return {"data": {"items": rows, "total": total, "offset": offset, "limit": limit}}


@router.get(
    "/audit/export",
    summary="Export audit CSV (admin)",
    response_class=Response,
    responses={
        200: {
            "content": {"text/csv": {}},
            "description": "CSV download, with spreadsheet formula protection",
        }
    },
    description="Use after_id to export batches of at most 10,000 records. No passwords, tokens, or comment bodies are included in audit details.",
)
async def export(
    ids: str | None = Query(None, max_length=10000),
    after_id: int = Query(0, ge=0),
    limit: int = Query(1000, ge=1, le=10000),
    actor=Depends(current_member),
    db=Depends(get_db),
):
    Service(db, actor).require(Role.ADMIN)
    query = select(Audit).where(Audit.id > after_id)
    if ids is not None:
        values = ids.split(",")
        if len(values) > 1000 or any(not value.isdigit() or len(value) > 18 for value in values):
            raise AppError(422, "Export accepts at most 1000 numeric audit identifiers")
        query = query.where(Audit.id.in_([int(value) for value in values]))
    # Audit records are immutable. Bound this download to the records present
    # at its start, and release the authentication/read connection before streaming.
    last_id = await db.scalar(query.with_only_columns(func.max(Audit.id))) or after_id
    sessions = async_sessionmaker(db.bind, expire_on_commit=False)
    await db.rollback()

    def safe(value):
        text = str(value)
        return (
            "'" + text
            if text.lstrip().startswith(("=", "+", "-", "@")) or text.startswith(("\t", "\r"))
            else text
        )

    async def chunks():
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["id", "time", "actor_id", "action", "target", "detail"])
        yield output.getvalue().encode("utf-8")
        cursor, remaining = after_id, limit
        while remaining and cursor < last_id:
            # Release each connection before waiting for a slow download client.
            async with sessions() as session:
                rows = (
                    await session.scalars(
                        query.where(Audit.id > cursor, Audit.id <= last_id)
                        .order_by(Audit.id)
                        .limit(min(100, remaining))
                    )
                ).all()
            if not rows:
                break
            output.seek(0)
            output.truncate(0)
            for row in rows:
                writer.writerow(
                    [
                        safe(value)
                        for value in [
                            row.id,
                            row.created_at.isoformat(),
                            row.actor_id,
                            row.action,
                            row.target,
                            row.detail,
                        ]
                    ]
                )
            cursor = rows[-1].id
            remaining -= len(rows)
            del rows
            yield output.getvalue().encode("utf-8")

    return StreamingResponse(
        chunks(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=wikiwatch-audit.csv"},
    )


@router.get(
    "/activity",
    response_model=SuccessResponse[ActivityResponse],
    summary="Read edit activity charts (admin)",
    description="Counts only edits admitted to the shared queue, including archived edits. This is not the global Wikimedia edit rate or a measured revert rate. Missing minutes have zero observations. Frontend fills those chart bins.",
)
async def activity(
    minutes: int = Query(60, ge=1, le=1440), actor=Depends(current_member), db=Depends(get_db)
):
    Service(db, actor).require(Role.ADMIN)
    cutoff = now() - timedelta(minutes=minutes)
    condition = Edit.occurred_at >= cutoff
    # Aggregate in the database; never materialize every article into server memory.
    minute = (
        func.date_trunc("minute", Edit.occurred_at)
        if db.bind.dialect.name == "postgresql"
        else func.strftime("%Y-%m-%dT%H:%M:00Z", Edit.occurred_at)
    )
    grouped = (
        await db.execute(
            select(minute.label("minute"), Edit.wiki, func.count(), func.sum(func.abs(Edit.delta)))
            .where(condition)
            .group_by(minute, Edit.wiki)
            .order_by(minute, Edit.wiki)
        )
    ).all()
    statuses = (
        await db.execute(select(Edit.status, func.count()).where(condition).group_by(Edit.status))
    ).all()
    pages = (
        await db.execute(
            select(Edit.wiki, Edit.title, func.count().label("total"))
            .where(condition)
            .group_by(Edit.wiki, Edit.title)
            .order_by(func.count().desc(), Edit.wiki, Edit.title)
            .limit(10)
        )
    ).all()
    return {
        "data": {
            "total": sum(count for _, count in statuses),
            "points": [
                {
                    "minute": value
                    if isinstance(value, str)
                    else value.strftime("%Y-%m-%dT%H:%M:00Z"),
                    "wiki": wiki,
                    "edits": count,
                    "bytes_changed": changed or 0,
                }
                for value, wiki, count, changed in grouped
            ],
            "by_status": dict(statuses),
            "top_pages": [
                {"wiki": wiki, "title": title, "edits": count} for wiki, title, count in pages
            ],
        }
    }
