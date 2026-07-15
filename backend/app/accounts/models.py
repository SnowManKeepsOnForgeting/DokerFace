"""Persistence models for accounts, public profiles, and sessions."""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Integer,
    String,
    Uuid,
    func,
)
from sqlalchemy import (
    Enum as SqlEnum,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

DEFAULT_AVATAR_BACKGROUND_COLOR = "#64748B"


class AccountRole(StrEnum):
    PLAYER = "player"
    ADMINISTRATOR = "administrator"


class AccountStatus(StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"
    DELETED = "deleted"


def enum_values(enum_type: type[StrEnum]) -> list[str]:
    return [member.value for member in enum_type]


account_role_enum = SqlEnum(
    AccountRole,
    name="account_role",
    values_callable=enum_values,
)
account_status_enum = SqlEnum(
    AccountStatus,
    name="account_status",
    values_callable=enum_values,
)


class Account(Base):
    __tablename__ = "accounts"

    account_id: Mapped[int] = mapped_column(
        Integer,
        Identity(start=1, increment=1),
        primary_key=True,
    )
    login_name: Mapped[str] = mapped_column(String(), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(), nullable=False)
    role: Mapped[AccountRole] = mapped_column(
        account_role_enum,
        nullable=False,
        default=AccountRole.PLAYER,
        server_default=AccountRole.PLAYER.value,
    )
    status: Mapped[AccountStatus] = mapped_column(
        account_status_enum,
        nullable=False,
        default=AccountStatus.ACTIVE,
        server_default=AccountStatus.ACTIVE.value,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    profile: Mapped[Profile | None] = relationship(
        back_populates="account",
        cascade="all, delete-orphan",
        uselist=False,
    )
    sessions: Mapped[list[AccountSession]] = relationship(
        back_populates="account",
        cascade="all, delete-orphan",
    )


class Profile(Base):
    __tablename__ = "profiles"
    __table_args__ = (
        CheckConstraint(
            "length(btrim(avatar_text)) > 0",
            name="ck_profiles_avatar_text_not_blank",
        ),
        CheckConstraint(
            "avatar_background_color ~ '^#[0-9A-Fa-f]{6}$'",
            name="ck_profiles_avatar_background_color_hex",
        ),
    )

    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.account_id", ondelete="CASCADE"),
        primary_key=True,
    )
    display_name: Mapped[str] = mapped_column(String(), nullable=False)
    avatar_text: Mapped[str] = mapped_column(String(), nullable=False)
    avatar_background_color: Mapped[str] = mapped_column(
        String(7),
        nullable=False,
        default=DEFAULT_AVATAR_BACKGROUND_COLOR,
        server_default=DEFAULT_AVATAR_BACKGROUND_COLOR,
    )
    rank_badge_theme: Mapped[str] = mapped_column(
        String(),
        nullable=False,
        default="default",
        server_default="default",
    )

    account: Mapped[Account] = relationship(back_populates="profile")


class AccountSession(Base):
    __tablename__ = "sessions"

    session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.account_id", ondelete="CASCADE"),
        nullable=False,
    )
    token_hash: Mapped[str] = mapped_column(String(), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_activity_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    account: Mapped[Account] = relationship(back_populates="sessions")


__all__ = [
    "DEFAULT_AVATAR_BACKGROUND_COLOR",
    "Account",
    "AccountRole",
    "AccountSession",
    "AccountStatus",
    "Profile",
]
