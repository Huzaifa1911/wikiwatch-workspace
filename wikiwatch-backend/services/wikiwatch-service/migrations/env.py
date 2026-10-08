import asyncio

from alembic import context

from app import models as models
from app.core.database import Base, engine

config = context.config


def sync_migrations(connection):
    context.configure(connection=connection, target_metadata=Base.metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


async def online():
    async with engine.connect() as connection:
        await connection.run_sync(sync_migrations)
    await engine.dispose()


if context.is_offline_mode():
    from app.core.database import url

    context.configure(url=url, target_metadata=Base.metadata, literal_binds=True, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    asyncio.run(online())
