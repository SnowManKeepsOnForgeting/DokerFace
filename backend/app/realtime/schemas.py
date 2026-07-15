"""Versioned payloads for room Socket.IO events."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class RoomJoinEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1] = 1
    room_id: UUID
    password: str | None = Field(default=None, min_length=1)


class RoomReadyEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1] = 1
    room_id: UUID
    ready: bool


class RoomLeaveEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1] = 1
    room_id: UUID


class RoomMemberSnapshot(BaseModel):
    account_id: int
    ready: bool


class RoomSnapshot(BaseModel):
    schema_version: Literal[1] = 1
    room_id: UUID
    host_account_id: int
    members: list[RoomMemberSnapshot]


__all__ = [
    "RoomJoinEvent",
    "RoomLeaveEvent",
    "RoomMemberSnapshot",
    "RoomReadyEvent",
    "RoomSnapshot",
]
