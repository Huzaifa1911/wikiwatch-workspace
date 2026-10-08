from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class RequestSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ORMResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class SuccessResponse[T](BaseModel):
    success: Literal[True] = True
    data: T


class ErrorResponse(BaseModel):
    error: str


class Page[T](BaseModel):
    items: list[T]
    total: int
    offset: int
    limit: int


class VersionRequest(RequestSchema):
    version: int = Field(
        ge=1, description="Version from the last read. A stale version returns 409."
    )
