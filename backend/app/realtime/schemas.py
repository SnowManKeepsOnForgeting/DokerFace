"""Versioned payloads for Socket.IO room and game events."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.game_engine.contracts import ActionType, LegalAction
from app.rooms.models import RoomStatus


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


class RoomStartEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1] = 1
    room_id: UUID


class GameActionEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1] = 1
    command_id: UUID
    match_id: UUID
    hand_id: UUID
    state_version: int = Field(ge=0)
    action: ActionType
    amount: int | None = Field(default=None, ge=0)


class GameRequestSnapshotEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1] = 1
    match_id: UUID


class RoomMemberSnapshot(BaseModel):
    account_id: int
    ready: bool
    seat: int | None = None
    connected: bool = True


class RoomSnapshot(BaseModel):
    schema_version: Literal[1] = 1
    room_id: UUID
    host_account_id: int
    status: RoomStatus = RoomStatus.WAITING
    members: list[RoomMemberSnapshot]
    match_id: UUID | None = None


class GamePlayerSnapshot(BaseModel):
    account_id: int
    seat: int
    display_name: str
    stack: int
    bet: int
    folded: bool
    all_in: bool
    connected: bool = True


class GamePublicSnapshot(BaseModel):
    schema_version: Literal[1] = 1
    match_id: UUID
    hand_id: UUID
    hand_number: int
    state_version: int
    street: str
    button_account_id: int
    actor_account_id: int | None
    board: list[str]
    pot_amounts: list[int]
    complete: bool
    players: list[GamePlayerSnapshot]


class GameLegalAction(BaseModel):
    action: ActionType
    min_amount: int | None = None
    max_amount: int | None = None

    @classmethod
    def from_domain(cls, action: LegalAction) -> "GameLegalAction":
        return cls(
            action=action.action,
            min_amount=action.min_amount,
            max_amount=action.max_amount,
        )


class GamePrivateSnapshot(GamePublicSnapshot):
    account_id: int
    hole_cards: list[str]
    legal_actions: list[GameLegalAction]


class GameActionRejected(BaseModel):
    schema_version: Literal[1] = 1
    command_id: UUID | None = None
    match_id: UUID | None = None
    hand_id: UUID | None = None
    state_version: int | None = None
    error: str


class GameHandSettled(BaseModel):
    schema_version: Literal[1] = 1
    match_id: UUID
    hand_id: UUID
    hand_number: int
    state_version: int
    account_ids: list[int]
    final_stacks: list[int]
    payoffs: list[int]


class GameMatchSettled(BaseModel):
    schema_version: Literal[1] = 1
    match_id: UUID
    state_version: int
    account_ids: list[int]
    final_stacks: list[int]
    status: str


__all__ = [
    "GameActionEvent",
    "GameActionRejected",
    "GameHandSettled",
    "GameLegalAction",
    "GameMatchSettled",
    "GamePlayerSnapshot",
    "GamePrivateSnapshot",
    "GamePublicSnapshot",
    "GameRequestSnapshotEvent",
    "RoomJoinEvent",
    "RoomLeaveEvent",
    "RoomMemberSnapshot",
    "RoomReadyEvent",
    "RoomSnapshot",
    "RoomStartEvent",
]
