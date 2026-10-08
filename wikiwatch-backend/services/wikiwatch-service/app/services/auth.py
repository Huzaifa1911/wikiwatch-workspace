import asyncio
from datetime import timedelta, timezone
from uuid import uuid4

from sqlalchemy import delete, select, update

from app.core.exceptions import AppError
from app.core.security import digest, new_token, verify_password
from app.core.settings import settings
from app.models import Member, Session
from app.models.entities import now
from app.schemas.contracts import MemberResponse, Tokens
from app.services.base import Service


def aware(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


class AuthService(Service):
    async def issue(self, member):
        # Serialize session creation for this account across PostgreSQL workers.
        await self.db.execute(select(Member).where(Member.id == member.id).with_for_update())
        await self.db.refresh(member)
        if not member.active:
            raise AppError(401, "Account disabled")
        await self.db.execute(
            delete(Session).where(
                Session.member_id == member.id,
                (Session.revoked.is_(True)) | (Session.refresh_expires <= now()),
            )
        )
        await self.capacity(
            Session, settings.sessions_per_member, "Active sessions", Session.member_id == member.id
        )
        access, refresh = new_token(), new_token()
        self.db.add(
            Session(
                id=str(uuid4()),
                member_id=member.id,
                access_hash=digest(access),
                refresh_hash=digest(refresh),
                access_expires=now() + timedelta(minutes=settings.access_minutes),
                refresh_expires=now() + timedelta(days=settings.refresh_days),
                revoked=False,
            )
        )
        await self.db.commit()
        return Tokens(
            access_token=access,
            refresh_token=refresh,
            expires_in=settings.access_minutes * 60,
            member=MemberResponse.model_validate(member),
        )

    async def login(self, body):
        member = await self.db.scalar(select(Member).where(Member.email == str(body.email).lower()))
        valid = await asyncio.to_thread(
            verify_password,
            body.password.get_secret_value(),
            member.password_hash if member else None,
        )
        if not valid or not member or not member.active:
            raise AppError(401, "Invalid email or password")
        return await self.issue(member)

    async def refresh(self, token):
        session = await self.db.scalar(select(Session).where(Session.refresh_hash == digest(token)))
        if not session or session.revoked or aware(session.refresh_expires) <= now():
            raise AppError(401, "Refresh token expired or revoked")
        member = await self.repo.get(Member, session.member_id)
        if not member.active:
            raise AppError(401, "Account disabled")
        # Atomic consume: parallel refreshes cannot issue two new sessions.
        result = await self.db.execute(
            update(Session)
            .where(Session.id == session.id, Session.revoked.is_(False))
            .values(revoked=True)
        )
        if result.rowcount != 1:
            raise AppError(401, "Refresh token already used")
        return await self.issue(member)

    async def authenticate(self, token):
        session = await self.repo.by_access(digest(token))
        if not session or session.revoked or aware(session.access_expires) <= now():
            raise AppError(401, "Access token expired or revoked")
        member = await self.repo.get(Member, session.member_id)
        if not member.active:
            raise AppError(401, "Account disabled")
        return member, session
