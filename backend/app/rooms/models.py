"""Persistence model for waiting room configuration."""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import DateTime, ForeignKey, String, Uuid, func
from sqlalchemy import Enum as SqlEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.rooms.config import RoomVisibility


class RoomStatus(StrEnum):
    WAITING = "waiting"
    ACTIVE = "active"
    CLOSED = "closed"


def enum_values(enum_type: type[StrEnum]) -> list[str]:
    return [member.value for member in enum_type]


room_visibility_enum = SqlEnum(
    RoomVisibility,
    name="room_visibility",
    values_callable=enum_values,
)
room_status_enum = SqlEnum(
    RoomStatus,
    name="room_status",
    values_callable=enum_values,
)


class Room(Base):
    __tablename__ = "rooms"

    room_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    host_account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.account_id", ondelete="RESTRICT"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(), nullable=False)
    visibility: Mapped[RoomVisibility] = mapped_column(room_visibility_enum, nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String())
    rules: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False)
    status: Mapped[RoomStatus] = mapped_column(
        room_status_enum,
        nullable=False,
        default=RoomStatus.WAITING,
        server_default=RoomStatus.WAITING.value,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


__all__ = ["Room", "RoomStatus"]
