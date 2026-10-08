from app.core.exceptions import AppError
from app.models import Audit, Event
from app.repositories.workspace import WorkspaceRepository


class Service:
    def __init__(self, db, actor=None):
        self.db, self.actor = db, actor
        self.repo = WorkspaceRepository(db)

    def require(self, *roles):
        if self.actor is None or not self.actor.active or self.actor.role not in roles:
            raise AppError(403, "This role cannot perform this operation")

    async def record(self, action, target, detail):
        self.db.add(Audit(actor_id=self.actor.id, action=action, target=target, detail=detail))
        self.db.add(Event(kind=action, target=target))
        await self.db.flush()
