"""HTTP endpoints for persistent room configurations."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.exc import NoResultFound
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account
from app.auth.dependencies import get_current_account
from app.auth.passwords import PasswordService
from app.db.dependencies import get_db_session
from app.rooms.config import RoomRules, RoomVisibility
from app.rooms.models import Room, RoomStatus
from app.rooms.registry import RoomRegistry

router = APIRouter(prefix="/api/v1/rooms", tags=["rooms"])


class CreateRoomRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1)
    visibility: RoomVisibility
    password: str | None = Field(default=None, min_length=1)
    rules: RoomRules

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Room name must not be blank")
        return value

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("Room password must not be blank")
        return value

    @model_validator(mode="after")
    def validate_visibility_password(self) -> "CreateRoomRequest":
        if self.visibility is RoomVisibility.PASSWORD and self.password is None:
            raise ValueError("Password visibility requires a password")
        if self.visibility is not RoomVisibility.PASSWORD and self.password is not None:
            raise ValueError("Only password rooms may set a password")
        return self


class RoomResponse(BaseModel):
    room_id: UUID
    host_account_id: int
    name: str
    visibility: RoomVisibility
    has_password: bool
    rules: RoomRules
    status: RoomStatus
    player_count: int
    spectator_count: int


class RoomListResponse(BaseModel):
    items: list[RoomResponse]


def to_room_response(room: Room, room_registry: RoomRegistry | None = None) -> RoomResponse:
    try:
        rules = RoomRules.model_validate(room.rules)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Stored room rules are invalid",
        ) from error

    player_count = 0
    spectator_count = 0
    if room_registry is not None:
        runtime = room_registry.get(room.room_id)
        if runtime is not None:
            player_count = len(runtime.members)

    return RoomResponse(
        room_id=room.room_id,
        host_account_id=room.host_account_id,
        name=room.name,
        visibility=room.visibility,
        has_password=room.password_hash is not None,
        rules=rules,
        status=room.status,
        player_count=player_count,
        spectator_count=spectator_count,
    )


@router.post("", response_model=RoomResponse, status_code=status.HTTP_201_CREATED)
async def create_room(
    payload: CreateRoomRequest,
    account: Annotated[Account, Depends(get_current_account)],
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
    request: Request,
) -> RoomResponse:
    password_service = PasswordService()
    room = Room(
        host_account_id=account.account_id,
        name=payload.name,
        visibility=payload.visibility,
        password_hash=(
            password_service.hash(payload.password) if payload.password is not None else None
        ),
        rules=payload.rules.model_dump(mode="json"),
        status=RoomStatus.WAITING,
    )
    db_session.add(room)
    await db_session.flush()
    await db_session.commit()

    # Broadcast lobby update
    socketio_server = getattr(request.app.state, "socketio", None)
    if socketio_server is not None:
        await socketio_server.emit("lobby:rooms-updated", {"schema_version": 1})

    room_registry = getattr(request.app.state, "room_registry", None)
    return to_room_response(room, room_registry)


@router.get("", response_model=RoomListResponse)
async def list_rooms(
    _: Annotated[Account, Depends(get_current_account)],
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
    request: Request,
) -> RoomListResponse:
    rooms = list(
        (
            await db_session.scalars(
                select(Room)
                .where(Room.status != RoomStatus.CLOSED)
                .order_by(Room.created_at.desc(), Room.room_id)
            )
        ).all()
    )
    room_registry = getattr(request.app.state, "room_registry", None)
    return RoomListResponse(items=[to_room_response(room, room_registry) for room in rooms])


@router.get("/{room_id}", response_model=RoomResponse)
async def get_room(
    room_id: UUID,
    _: Annotated[Account, Depends(get_current_account)],
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
    request: Request,
) -> RoomResponse:
    try:
        room = await db_session.scalar(select(Room).where(Room.room_id == room_id))
    except NoResultFound:
        room = None
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    room_registry = getattr(request.app.state, "room_registry", None)
    return to_room_response(room, room_registry)


__all__ = ["router"]
