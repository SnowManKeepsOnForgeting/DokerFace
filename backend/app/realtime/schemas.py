"""Versioned payloads for Socket.IO room and game events."""

from datetime import datetime
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


class RoomKickEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1] = 1
    room_id: UUID
    target_account_id: int = Field(ge=1)


class RoomKickedEvent(BaseModel):
    schema_version: Literal[1] = 1
    room_id: UUID
    reason: str = "kicked"


class LobbyRoomsUpdatedEvent(BaseModel):
    schema_version: Literal[1] = 1


class ChatSendEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1] = 1
    room_id: UUID
    message_type: Literal["text", "quick", "custom_quick"]
    content: str = Field(min_length=1, max_length=500)


class EmoteSendEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1] = 1
    room_id: UUID
    emote: str = Field(min_length=1, max_length=64)
    target_account_id: int | None = Field(default=None, ge=1)


class ChatMessagePayload(BaseModel):
    schema_version: Literal[1] = 1
    message_id: UUID
    room_id: UUID
    account_id: int
    message_type: Literal["text", "quick", "custom_quick"]
    content: str
    target_account_id: int | None = None
    created_at: datetime


class EmotePayload(BaseModel):
    schema_version: Literal[1] = 1
    room_id: UUID
    account_id: int
    emote: str
    target_account_id: int | None = None


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
    action_deadline_at: datetime | None = None


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
    "LobbyRoomsUpdatedEvent",
    "RoomJoinEvent",
    "RoomKickedEvent",
    "RoomLeaveEvent",
    "RoomMemberSnapshot",
    "RoomReadyEvent",
    "RoomSnapshot",
    "RoomStartEvent",
]
