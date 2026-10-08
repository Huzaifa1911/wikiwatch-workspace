from collections import Counter
from uuid import uuid4

from sqlalchemy import func, select

from app.core.enums import Role, Status
from app.core.exceptions import AppError
from app.core.settings import settings
from app.models import Edit, Member
from app.models.entities import now
from app.schemas.contracts import EditResponse, MemberResponse
from app.services.base import Service


class EditService(Service):
    async def admit(self, body):
        self.require(Role.REVIEWER, Role.LEAD)
        total = await self.db.scalar(
            select(func.count()).select_from(Edit).where(Edit.archived.is_(False))
        )
        result = []
        for item in body.edits:
            existing = await self.db.scalar(
                select(Edit).where(Edit.wiki == item.wiki, Edit.new_rev == item.new_rev)
            )
            if existing:
                result.append(EditResponse.model_validate(existing))
                continue
            if total >= settings.queue_capacity:
                raise AppError(
                    409,
                    "Queue capacity reached. Admin must archive old unclaimed or completed edits.",
                )
            edit = Edit(
                id=str(uuid4()),
                **item.model_dump(),
                status=Status.UNCLAIMED,
                version=1,
                archived=False,
                reason="",
                return_reason="",
            )
            await self.repo.add(edit)
            result.append(EditResponse.model_validate(edit))
            total += 1
            await self.record(
                "edit.admitted", edit.id, {"wiki": edit.wiki, "new_rev": edit.new_rev}
            )
        await self.db.commit()
        return result

    async def transition(self, edit_id, body):
        edit = await self.repo.get(Edit, edit_id)
        if edit.archived:
            raise AppError(409, "Edit is archived")
        if edit.version != body.version:
            raise AppError(409, "Stale version. Reload this edit.")
        op, status = body.operation, edit.status
        values = {}
        reason = body.reason.strip()
        if op in {"claim", "ok", "flag", "release"} and self.actor.role == Role.REVIEWER:
            if op == "claim":
                if status != Status.UNCLAIMED:
                    raise AppError(409, "Edit is already claimed or reviewed")
                values = dict(
                    status=Status.CLAIMED, owner_id=self.actor.id, reason="", return_reason=""
                )
            else:
                if edit.owner_id != self.actor.id:
                    raise AppError(403, "Only the claim owner can review or release it")
                if status not in {Status.CLAIMED, Status.RETURNED}:
                    raise AppError(409, "Claim cannot be changed in this state")
                if op == "flag" and not reason:
                    raise AppError(422, "A flag reason is required")
                values = dict(
                    status={"ok": Status.OK, "flag": Status.FLAGGED, "release": Status.UNCLAIMED}[
                        op
                    ],
                    owner_id=None if op == "release" else edit.owner_id,
                    reason="" if op == "release" else reason,
                    return_reason="",
                )
        else:
            self.require(Role.LEAD)
            if op == "assign":
                if status not in {Status.UNCLAIMED, Status.CLAIMED, Status.RETURNED}:
                    raise AppError(409, "Only unfinished claims can be assigned")
                owner = await self.repo.get(Member, body.owner_id or "")
                if not owner.active or owner.role != Role.REVIEWER:
                    raise AppError(422, "Owner must be an active reviewer")
                values = dict(
                    owner_id=owner.id,
                    status=Status.RETURNED if status == Status.RETURNED else Status.CLAIMED,
                )
            elif op == "release":
                if status != Status.CLAIMED:
                    raise AppError(409, "Lead can release only a claimed edit")
                values = dict(status=Status.UNCLAIMED, owner_id=None, reason="", return_reason="")
            elif op in {"return", "verify"}:
                if status != Status.FLAGGED:
                    raise AppError(409, "Only flagged edits need verification")
                if op == "return" and not reason:
                    raise AppError(422, "Return feedback is required")
                values = dict(
                    status=Status.RETURNED if op == "return" else Status.VERIFIED_FLAGGED,
                    return_reason=reason if op == "return" else "",
                )
            elif op == "reopen":
                if status not in {Status.OK, Status.VERIFIED_FLAGGED} or not reason:
                    raise AppError(422, "Reopen needs a completed review and feedback")
                values = dict(status=Status.RETURNED, return_reason=reason)
            else:
                raise AppError(403, "Operation is unavailable for this role")
        next_status = values.get("status", status)
        if next_status == Status.CLAIMED and status == Status.UNCLAIMED:
            values["claimed_at"] = now()
        if next_status == Status.UNCLAIMED:
            values["claimed_at"] = None
        values["reviewed_at"] = (
            now() if next_status in {Status.OK, Status.VERIFIED_FLAGGED} else None
        )
        if not await self.repo.cas_edit(edit.id, body.version, values):
            raise AppError(409, "Another user changed this edit. Reload it.")
        await self.record(
            "claim." + str(op),
            edit.id,
            {
                "from": status,
                "to": values.get("status", status),
                "owner_id": values.get("owner_id", edit.owner_id),
                "reason": reason,
                "version": body.version + 1,
            },
        )
        await self.db.commit()
        await self.db.refresh(edit)
        return edit

    async def archive(self, edit_id, version):
        self.require(Role.ADMIN)
        edit = await self.repo.get(Edit, edit_id)
        if edit.status not in {Status.UNCLAIMED, Status.OK, Status.VERIFIED_FLAGGED}:
            raise AppError(409, "Unfinished claims cannot be archived")
        if not await self.repo.cas_edit(edit_id, version, {"archived": True}):
            raise AppError(409, "Stale version")
        await self.record("edit.archived", edit_id, {})
        await self.db.commit()
        await self.db.refresh(edit)
        return edit

    async def board(self):
        self.require(Role.LEAD)
        counts = Counter(
            (await self.db.scalars(select(Edit.status).where(Edit.archived.is_(False)))).all()
        )
        return {
            "counts": {
                "unclaimed": counts["unclaimed"],
                "claimed": counts["claimed"],
                "flagged": counts["flagged"],
                "returned": counts["returned"],
                "reviewed": counts["ok"] + counts["verified_flagged"],
            }
        }

    async def workload(self):
        self.require(Role.LEAD)
        members = (await self.db.scalars(select(Member).where(Member.role == Role.REVIEWER))).all()
        result = []
        for member in members:
            counts = Counter(
                (
                    await self.db.scalars(
                        select(Edit.status).where(
                            Edit.owner_id == member.id, Edit.archived.is_(False)
                        )
                    )
                ).all()
            )
            result.append({"member": MemberResponse.model_validate(member), "counts": dict(counts)})
        return result
