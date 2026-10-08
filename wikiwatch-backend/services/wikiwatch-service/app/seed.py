"""Explicit instructor bootstrap, never called on application startup."""

import asyncio
import os
from uuid import uuid4

from dotenv import load_dotenv
from sqlalchemy import select

from app.core.database import SessionLocal, engine
from app.core.security import hash_password
from app.models import Member


async def seed():
    load_dotenv()
    password = os.environ.get("WIKIWATCH_BOOTSTRAP_PASSWORD", "")
    if len(password) < 12:
        raise SystemExit("Set WIKIWATCH_BOOTSTRAP_PASSWORD (at least 12 characters).")
    email = os.environ.get("WIKIWATCH_BOOTSTRAP_EMAIL", "noor@example.org").lower()
    accounts = [("Noor Haddad", email, "admin")]
    if os.environ.get("WIKIWATCH_SEED_DEMO") == "true":
        accounts += [
            ("Dev Patel", "dev@example.org", "reviewer"),
            ("Amir Reza", "amir@example.org", "reviewer"),
            ("Sara Okafor", "sara@example.org", "lead"),
        ]
    async with SessionLocal() as db:
        for name, email, role in accounts:
            if await db.scalar(select(Member.id).where(Member.email == email)):
                continue
            db.add(
                Member(
                    id=str(uuid4()),
                    name=name,
                    email=email,
                    role=role,
                    active=True,
                    password_hash=hash_password(password),
                )
            )
        await db.commit()
    await engine.dispose()
    print("Bootstrap complete. Existing accounts were not changed.")


if __name__ == "__main__":
    asyncio.run(seed())
