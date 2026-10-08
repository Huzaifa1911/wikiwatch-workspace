import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.security import hash_password

# Set before importing settings/application. Can run against real PostgreSQL too.
os.environ["WIKIWATCH_DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "sqlite+aiosqlite:///" + str(Path(tempfile.mkdtemp()) / "test.db")
)
import asyncio

from app.core.database import Base, SessionLocal, engine
from app.main import create_application
from app.models import Member, WorkspaceLock


@pytest.fixture()
def client():
    async def setup():
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.drop_all)
            await connection.run_sync(Base.metadata.create_all)
        async with SessionLocal() as db:
            db.add(WorkspaceLock(id=1))
            for key, role in [
                ("dev", "reviewer"),
                ("amir", "reviewer"),
                ("sara", "lead"),
                ("noor", "admin"),
            ]:
                db.add(
                    Member(
                        id=key,
                        name=key.title(),
                        email=key + "@example.org",
                        role=role,
                        active=True,
                        password_hash=hash_password("test-password-123"),
                    )
                )
            await db.commit()
        await engine.dispose()

    asyncio.run(setup())
    with TestClient(create_application()) as client:
        yield client


@pytest.fixture()
def auth(client):
    tokens = {}
    for user in ["dev", "amir", "sara", "noor"]:
        response = client.post(
            "/wikiwatch-service/v1/auth/login",
            json={"email": user + "@example.org", "password": "test-password-123"},
        )
        assert response.status_code == 200, response.text
        tokens[user] = response.json()["data"]
    return tokens
