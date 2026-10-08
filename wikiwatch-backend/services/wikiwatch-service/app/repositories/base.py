from sqlalchemy import func, select

from app.core.exceptions import AppError


class Repository:
    """Database access only. Services own commits and authorization."""

    def __init__(self, db):
        self.db = db

    async def get(self, model, key):
        row = await self.db.get(model, key)
        if row is None:
            raise AppError(404, "Record not found")
        return row

    async def page(self, model, conditions, offset, limit):
        total = await self.db.scalar(select(func.count()).select_from(model).where(*conditions))
        rows = list(
            (
                await self.db.scalars(
                    select(model).where(*conditions).order_by(model.id).offset(offset).limit(limit)
                )
            ).all()
        )
        return rows, total

    async def add(self, entity):
        self.db.add(entity)
        await self.db.flush()
        return entity
