import csv
import io
from collections import Counter
from datetime import timedelta

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import select

from app.core.database import get_db
from app.core.enums import Role
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
    actor=Depends(current_member),
    db=Depends(get_db),
):
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
    after_id: int = Query(0, ge=0),
    limit: int = Query(1000, ge=1, le=10000),
    actor=Depends(current_member),
    db=Depends(get_db),
):
    Service(db, actor).require(Role.ADMIN)
    rows = (
        await db.scalars(select(Audit).where(Audit.id > after_id).order_by(Audit.id).limit(limit))
    ).all()

    def safe(value):
        text = str(value)
        return (
            "'" + text
            if text.lstrip().startswith(("=", "+", "-", "@")) or text.startswith(("\t", "\r"))
            else text
        )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "time", "actor_id", "action", "target", "detail"])
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
    return Response(
        output.getvalue(),
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
    rows = (
        await db.scalars(select(Edit).where(Edit.occurred_at >= now() - timedelta(minutes=minutes)))
    ).all()
    points = {}
    for row in rows:
        key = (row.occurred_at.strftime("%Y-%m-%dT%H:%M:00Z"), row.wiki)
        point = points.setdefault(
            key, {"minute": key[0], "wiki": key[1], "edits": 0, "bytes_changed": 0}
        )
        point["edits"] += 1
        point["bytes_changed"] += abs(row.delta)
    pages = Counter((row.wiki, row.title) for row in rows)
    return {
        "data": {
            "total": len(rows),
            "points": [points[key] for key in sorted(points)],
            "by_status": dict(Counter(row.status for row in rows)),
            "top_pages": [
                {"wiki": key[0], "title": key[1], "edits": count}
                for key, count in pages.most_common(10)
            ],
        }
    }
