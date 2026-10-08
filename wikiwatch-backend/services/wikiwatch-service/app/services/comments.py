from uuid import uuid4

from sqlalchemy import select

from app.core.enums import Role
from app.core.exceptions import AppError
from app.core.settings import settings
from app.models import Comment, Edit, Thread
from app.schemas.contracts import ThreadResponse
from app.services.base import Service


class CommentService(Service):
    async def permitted(self, edit_id):
        self.require(Role.REVIEWER, Role.LEAD)
        edit = await self.repo.get(Edit, edit_id)
        if edit.archived:
            raise AppError(409, "Archived edits are read only")
        return edit

    async def response(self, thread):
        comments = list(
            (
                await self.db.scalars(
                    select(Comment)
                    .where(Comment.thread_id == thread.id)
                    .order_by(Comment.created_at, Comment.id)
                    .limit(settings.comments_per_thread + 1)
                )
            ).all()
        )
        if len(comments) > settings.comments_per_thread:
            raise AppError(409, "This retained thread exceeds the discussion limit. Export or maintain its history before loading it.")
        return ThreadResponse(
            **{
                key: getattr(thread, key)
                for key in [
                    "id",
                    "edit_id",
                    "author_id",
                    "anchor",
                    "resolved",
                    "version",
                    "created_at",
                ]
            },
            comments=comments,
        )

    async def create(self, edit_id, body):
        edit = await self.permitted(edit_id)
        await self.capacity(Thread, settings.thread_capacity, "Stored threads")
        await self.capacity(
            Thread, settings.threads_per_edit, "Threads for this edit", Thread.edit_id == edit_id
        )
        await self.capacity(Comment, settings.comment_capacity, "Stored comments")
        anchor = body.anchor
        if (anchor.wiki, anchor.old_rev, anchor.new_rev) != (edit.wiki, edit.old_rev, edit.new_rev):
            raise AppError(422, "Anchor must refer to this edit's fixed revision pair")
        thread = Thread(
            id=str(uuid4()),
            edit_id=edit_id,
            author_id=self.actor.id,
            anchor=anchor.model_dump(),
            resolved=False,
            version=1,
        )
        await self.repo.add(thread)
        await self.repo.add(
            Comment(id=str(uuid4()), thread_id=thread.id, author_id=self.actor.id, body=body.body)
        )
        await self.record("thread.created", thread.id, {"edit_id": edit_id})
        await self.db.commit()
        return await self.response(thread)

    async def reply(self, thread_id, body):
        thread = await self.repo.get(Thread, thread_id)
        await self.permitted(thread.edit_id)
        if thread.deleted:
            raise AppError(404, "Thread not found")
        if thread.resolved:
            raise AppError(409, "Reopen the thread before replying")
        await self.capacity(Comment, settings.comment_capacity, "Stored comments")
        await self.capacity(
            Comment,
            settings.comments_per_thread,
            "Comments in this thread",
            Comment.thread_id == thread_id,
        )
        # Shared version CAS serializes reply vs resolution.
        if not await self.repo.cas_thread(thread_id, thread.version, False):
            raise AppError(409, "Thread changed. Reload it.")
        comment = Comment(
            id=str(uuid4()), thread_id=thread.id, author_id=self.actor.id, body=body.body
        )
        await self.repo.add(comment)
        await self.record("thread.replied", thread.id, {"edit_id": thread.edit_id})
        await self.db.commit()
        return {
            "id": comment.id,
            "author_id": comment.author_id,
            "body": comment.body,
            "created_at": comment.created_at,
            "thread_version": thread.version,
        }

    async def resolve(self, thread_id, body):
        thread = await self.repo.get(Thread, thread_id)
        await self.permitted(thread.edit_id)
        if thread.deleted:
            raise AppError(404, "Thread not found")
        if not await self.repo.cas_thread(thread_id, body.version, body.resolved):
            raise AppError(409, "Thread changed. Reload it.")
        await self.record(
            "thread.resolved" if body.resolved else "thread.reopened",
            thread.id,
            {"edit_id": thread.edit_id},
        )
        await self.db.commit()
        await self.db.refresh(thread)
        return await self.response(thread)

    async def remove(self, thread_id, version):
        from sqlalchemy import update

        thread = await self.repo.get(Thread, thread_id)
        await self.permitted(thread.edit_id)
        if thread.author_id != self.actor.id:
            raise AppError(403, "Only the thread author can delete it")
        result = await self.db.execute(
            update(Thread)
            .where(Thread.id == thread_id, Thread.version == version, Thread.deleted.is_(False))
            .values(deleted=True, version=version + 1)
        )
        if result.rowcount != 1:
            raise AppError(409, "Thread changed or was already deleted")
        await self.record("thread.deleted", thread_id, {"edit_id": thread.edit_id})
        await self.db.commit()
        return {"deleted": True}
