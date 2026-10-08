from sqlalchemy import event
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.settings import settings


class Base(DeclarativeBase):
    pass


url = settings.database_url
if url.startswith("postgresql://"):
    url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
# asyncpg accepts ssl, not libpq's sslmode/channel_binding query options.
if "postgresql+asyncpg" in url:
    from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

    parts = urlsplit(url)
    args = dict(parse_qsl(parts.query))
    if "sslmode" in args:
        args["ssl"] = args.pop("sslmode")
    args.pop("channel_binding", None)
    url = urlunsplit(parts._replace(query=urlencode(args)))
options = {"pool_pre_ping": True}
if "postgresql+asyncpg" in url:
    options.update(
        pool_size=5,
        max_overflow=0,
        pool_timeout=10,
        connect_args={"server_settings": {"statement_timeout": "15000", "lock_timeout": "10000"}},
    )
engine = create_async_engine(url, **options)
if url.startswith("sqlite"):

    @event.listens_for(engine.sync_engine, "connect")
    def sqlite_pragmas(connection, _):
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=10000")
        cursor.close()


SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db():
    async with SessionLocal() as session:
        yield session
