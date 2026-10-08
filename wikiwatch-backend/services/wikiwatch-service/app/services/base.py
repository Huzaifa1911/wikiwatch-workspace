from sqlalchemy import func, select

from app.core.exceptions import AppError
from app.core.settings import settings
from app.models import Audit, Event
from app.repositories.workspace import WorkspaceRepository


class Service:
    def __init__(self, db, actor=None):
        self.db, self.actor = db, actor
        self.repo = WorkspaceRepository(db)

    def require(self, *roles):
        if self.actor is None or not self.actor.active or self.actor.role not in roles:
            raise AppError(403, "This role cannot perform this operation")

    async def capacity(self, model, maximum, label, *conditions):
        count = await self.db.scalar(select(func.count()).select_from(model).where(*conditions))
        if count >= maximum:
            raise AppError(
                409,
                f"{label} capacity reached. Export and maintain stored history before adding more records.",
            )

    async def record(self, action, target, detail):
        # Same transaction and workspace lock as the business change: rejection rolls it back.
        await self.capacity(Audit, settings.audit_capacity, "Audit history")
        await self.capacity(Event, settings.audit_capacity, "Synchronization history")
        self.db.add(Audit(actor_id=self.actor.id, action=action, target=target, detail=detail))
        self.db.add(Event(kind=action, target=target))
        await self.db.flush()
