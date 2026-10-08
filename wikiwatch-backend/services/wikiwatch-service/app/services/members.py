from uuid import uuid4

from sqlalchemy import select

from app.core.enums import Role, Status
from app.core.exceptions import AppError
from app.core.security import hash_password
from app.models import Edit, Member
from app.services.base import Service


class MemberService(Service):
    async def create(self, body):
        self.require(Role.ADMIN)
        member = Member(
            id=str(uuid4()),
            name=body.name.strip(),
            email=str(body.email).lower(),
            role=body.role,
            active=True,
            password_hash=hash_password(body.password.get_secret_value()),
        )
        if not member.name:
            raise AppError(422, "Name cannot be blank")
        await self.repo.add(member)
        await self.record("member.added", member.id, {"role": member.role})
        await self.db.commit()
        return member

    async def change(self, member_id, body):
        self.require(Role.ADMIN)
        member = await self.repo.get(Member, member_id)
        await self.db.execute(select(Member).where(Member.id == member_id).with_for_update())
        if member.id == self.actor.id and (
            body.active is False or body.role not in {None, Role.ADMIN}
        ):
            raise AppError(409, "You cannot remove your own admin access")
        if body.active is False or (body.role is not None and body.role != Role.REVIEWER):
            pending = await self.db.scalar(
                select(Edit.id)
                .where(
                    Edit.owner_id == member_id,
                    Edit.status.in_([Status.CLAIMED, Status.FLAGGED, Status.RETURNED]),
                )
                .limit(1)
            )
            if pending:
                raise AppError(409, "Reassign or complete unfinished claims first")
        changes = body.model_dump(exclude_none=True)
        for key, value in changes.items():
            setattr(member, key, value)
        await self.record("member.updated", member.id, changes)
        await self.db.commit()
        return member
