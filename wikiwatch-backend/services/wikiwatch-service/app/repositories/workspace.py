from sqlalchemy import select, update

from app.models import Edit, Session, Thread
from app.repositories.base import Repository


class WorkspaceRepository(Repository):
    async def cas_edit(self, edit_id, version, values):
        result = await self.db.execute(
            update(Edit)
            .where(Edit.id == edit_id, Edit.version == version)
            .values(**values, version=version + 1)
        )
        return result.rowcount == 1

    async def cas_thread(self, thread_id, version, resolved):
        result = await self.db.execute(
            update(Thread)
            .where(Thread.id == thread_id, Thread.version == version)
            .values(resolved=resolved, version=version + 1)
        )
        return result.rowcount == 1

    async def by_access(self, hashed):
        return await self.db.scalar(select(Session).where(Session.access_hash == hashed))
