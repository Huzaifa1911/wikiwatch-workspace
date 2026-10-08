from sqlalchemy import update

from app.core.exceptions import AppError
from app.models import Preference
from app.schemas.contracts import PreferenceRequest
from app.services.base import Service


class PreferenceService(Service):
    async def read(self):
        preference = await self.db.get(Preference, self.actor.id)
        if preference:
            return {"version": preference.version, **preference.data}
        return PreferenceRequest(version=1).model_dump()

    async def save(self, body):
        row = await self.db.get(Preference, self.actor.id)
        data = body.model_dump(exclude={"version"})
        if row:
            result = await self.db.execute(
                update(Preference)
                .where(Preference.member_id == self.actor.id, Preference.version == body.version)
                .values(data=data, version=body.version + 1)
            )
            if result.rowcount != 1:
                raise AppError(409, "Preferences changed. Reload.")
        else:
            if body.version != 1:
                raise AppError(409, "Initial preference version is 1")
            self.db.add(Preference(member_id=self.actor.id, data=data, version=2))
        await self.db.commit()
        return {"version": body.version + 1, **data}
