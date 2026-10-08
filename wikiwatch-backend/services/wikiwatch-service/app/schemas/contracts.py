from datetime import datetime, timezone
from typing import Literal

from pydantic import EmailStr, Field, SecretStr, field_validator, model_validator

from app.core.enums import Operation, Role, Status
from app.schemas.base import ORMResponse, RequestSchema, VersionRequest


class LoginRequest(RequestSchema):
    email: EmailStr
    password: SecretStr = Field(min_length=1, max_length=200)


class RefreshRequest(RequestSchema):
    refresh_token: SecretStr = Field(min_length=1, max_length=200)


class MemberResponse(ORMResponse):
    id: str
    name: str
    email: str
    role: Role
    active: bool


class DirectoryMember(ORMResponse):
    id: str
    name: str
    role: Role
    active: bool


class Tokens(RequestSchema):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    member: MemberResponse


class MemberCreate(RequestSchema):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    role: Role
    password: SecretStr = Field(min_length=12, max_length=200)


class MemberUpdate(RequestSchema):
    role: Role | None = None
    active: bool | None = None


class EditInput(RequestSchema):
    wiki: str = Field(pattern=r"^[a-z0-9_]{2,64}$", examples=["enwiki"])
    title: str = Field(min_length=1, max_length=500)
    editor: str = Field(min_length=1, max_length=255)
    comment: str = Field(default="", max_length=5000)
    old_rev: int = Field(ge=0, le=9223372036854775807)
    new_rev: int = Field(gt=0, le=9223372036854775807)
    page_id: int = Field(gt=0, le=9223372036854775807)
    namespace: int = Field(default=0, ge=0, le=2147483647)
    bot: bool = False
    delta: int = Field(default=0, ge=-2147483647, le=2147483647)
    occurred_at: datetime

    @field_validator("occurred_at")
    @classmethod
    def timezone_required(cls, value):
        if value.tzinfo is None:
            raise ValueError("Timestamp must include timezone")
        return value.astimezone(timezone.utc)


class AdmitRequest(RequestSchema):
    edits: list[EditInput] = Field(min_length=1, max_length=100)


class EditResponse(EditInput, ORMResponse):
    id: str
    status: Status
    owner_id: str | None
    reason: str
    return_reason: str
    version: int
    archived: bool
    admitted_at: datetime
    claimed_at: datetime | None
    reviewed_at: datetime | None
    updated_at: datetime


class TransitionRequest(VersionRequest):
    operation: Operation
    owner_id: str | None = Field(default=None, description="Required for lead assignment")
    reason: str = Field(default="", max_length=5000)


class Anchor(RequestSchema):
    wiki: str
    old_rev: int = Field(ge=0, le=9223372036854775807)
    new_rev: int = Field(gt=0, le=9223372036854775807)
    side: Literal["old", "new"]
    start_line: int = Field(ge=1)
    end_line: int = Field(ge=1)
    start_offset: int = Field(
        default=0,
        ge=0,
        description="UTF-16 offset within the plain-text line, as used by JavaScript",
    )
    end_offset: int = Field(default=0, ge=0)
    source_hash: str = Field(
        default="",
        max_length=128,
        description="Optional hash of the full plain-text revision, for frontend stale-anchor detection",
    )
    prefix: str = Field(default="", max_length=64)
    suffix: str = Field(default="", max_length=64)
    quote: str = Field(
        default="", max_length=2000, description="Plain text only. Never store DOM or diff HTML."
    )

    @model_validator(mode="after")
    def ordered(self):
        if self.end_line < self.start_line or (
            self.end_line == self.start_line and self.end_offset < self.start_offset
        ):
            raise ValueError("Anchor end must follow start")
        return self


class ThreadCreate(RequestSchema):
    anchor: Anchor
    body: str = Field(min_length=1, max_length=5000)

    @field_validator("body")
    @classmethod
    def body_not_blank(cls, value):
        if not value.strip():
            raise ValueError("Comment cannot be blank")
        return value


class CommentCreate(RequestSchema):
    body: str = Field(min_length=1, max_length=5000)
    _body = field_validator("body")(ThreadCreate.body_not_blank.__func__)


class CommentResponse(ORMResponse):
    id: str
    author_id: str
    body: str
    created_at: datetime


class ReplyResponse(CommentResponse):
    thread_version: int


class ThreadResponse(ORMResponse):
    id: str
    edit_id: str
    author_id: str
    anchor: Anchor
    resolved: bool
    version: int
    created_at: datetime
    comments: list[CommentResponse]


class ResolveRequest(VersionRequest):
    resolved: bool


class AuditResponse(ORMResponse):
    id: int
    actor_id: str
    action: str
    target: str
    detail: dict
    created_at: datetime


class EventResponse(ORMResponse):
    id: int
    kind: str
    target: str
    created_at: datetime


class EventsResponse(RequestSchema):
    items: list[EventResponse]
    next_cursor: int
    has_more: bool


class PreferenceRequest(VersionRequest):
    board_order: list[Literal["unclaimed", "claimed", "flagged", "returned", "reviewed"]] = Field(
        default_factory=lambda: ["unclaimed", "claimed", "flagged", "returned", "reviewed"]
    )
    viewed_edit_ids: list[str] = Field(default_factory=list, max_length=1000)

    @field_validator("viewed_edit_ids")
    @classmethod
    def bounded_ids(cls, value):
        if any(len(item) > 36 for item in value):
            raise ValueError("Viewed edit identifiers must be at most 36 characters")
        return list(dict.fromkeys(value))

    @field_validator("board_order")
    @classmethod
    def columns(cls, value):
        if len(value) != 5 or len(set(value)) != 5:
            raise ValueError("Each board column must occur once")
        return value


class PreferenceResponse(RequestSchema):
    version: int
    board_order: list[str]
    viewed_edit_ids: list[str]


class BoardResponse(RequestSchema):
    counts: dict[str, int]


class WorkloadResponse(RequestSchema):
    member: MemberResponse
    counts: dict[str, int]


class ActivityPoint(RequestSchema):
    minute: str
    wiki: str
    edits: int
    bytes_changed: int


class TopPage(RequestSchema):
    wiki: str
    title: str
    edits: int


class HealthResponse(RequestSchema):
    status: Literal["UP"] = "UP"
    database: Literal["up"] = "up"


class LogoutResponse(RequestSchema):
    logged_out: Literal[True] = True


class DeleteResponse(RequestSchema):
    deleted: Literal[True] = True


class ActivityResponse(RequestSchema):
    scope: Literal["admitted_queue"] = "admitted_queue"
    total: int
    points: list[ActivityPoint]
    by_status: dict[str, int]
    top_pages: list[TopPage]
