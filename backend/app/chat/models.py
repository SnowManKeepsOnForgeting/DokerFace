"""Persistence model for public room chat messages."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ChatMessageRecord(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (Index("ix_chat_messages_room_id_created_at", "room_id", "created_at"),)

    message_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    room_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("rooms.room_id", ondelete="RESTRICT"),
        nullable=False,
    )
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.account_id", ondelete="RESTRICT"),
        nullable=False,
    )
    message_type: Mapped[str] = mapped_column(String(24), nullable=False)
    content: Mapped[str] = mapped_column(String(500), nullable=False)
    target_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("accounts.account_id", ondelete="RESTRICT"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


__all__ = ["ChatMessageRecord"]
