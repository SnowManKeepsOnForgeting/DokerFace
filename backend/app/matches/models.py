"""SQLAlchemy models for auditable match and hand history."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class MatchRecord(Base):
    __tablename__ = "matches"
    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'complete', 'void')",
            name="ck_matches_status_values",
        ),
        Index("ix_matches_room_id", "room_id"),
        Index("ix_matches_status_started_at", "status", "started_at"),
    )

    match_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    room_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("rooms.room_id", ondelete="RESTRICT"),
        nullable=False,
    )
    rules_snapshot: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False)
    end_mode: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="active",
        server_default=text("'active'"),
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    void_reason: Mapped[str | None] = mapped_column(String())

    players: Mapped[list[MatchPlayerRecord]] = relationship(
        back_populates="match",
        cascade="all, delete-orphan",
    )
    hands: Mapped[list[HandRecord]] = relationship(
        back_populates="match",
        cascade="all, delete-orphan",
    )


class MatchPlayerRecord(Base):
    __tablename__ = "match_players"
    __table_args__ = (
        UniqueConstraint("match_id", "seat", name="uq_match_players_match_id_seat"),
        Index("ix_match_players_account_id", "account_id"),
    )

    match_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("matches.match_id", ondelete="CASCADE"),
        primary_key=True,
    )
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.account_id", ondelete="RESTRICT"),
        primary_key=True,
    )
    seat: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    display_name: Mapped[str] = mapped_column(String(), nullable=False)
    initial_chips: Mapped[int] = mapped_column(BigInteger, nullable=False)
    final_chips: Mapped[int | None] = mapped_column(BigInteger)
    finishing_rank: Mapped[int | None] = mapped_column(SmallInteger)
    exit_reason: Mapped[str | None] = mapped_column(String())

    match: Mapped[MatchRecord] = relationship(back_populates="players")


class HandRecord(Base):
    __tablename__ = "hands"
    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'settled', 'void')",
            name="ck_hands_status_values",
        ),
        UniqueConstraint("match_id", "hand_number", name="uq_hands_match_id_hand_number"),
        Index("ix_hands_match_id", "match_id"),
    )

    hand_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
    )
    match_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("matches.match_id", ondelete="CASCADE"),
        nullable=False,
    )
    hand_number: Mapped[int] = mapped_column(Integer, nullable=False)
    button_account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.account_id", ondelete="RESTRICT"),
        nullable=False,
    )
    small_blind: Mapped[int] = mapped_column(BigInteger, nullable=False)
    big_blind: Mapped[int] = mapped_column(BigInteger, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    public_board: Mapped[list[str]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
        server_default=text("'[]'::jsonb"),
    )
    settlement_summary: Mapped[dict[str, object] | None] = mapped_column(JSONB)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    match: Mapped[MatchRecord] = relationship(back_populates="hands")
    players: Mapped[list[HandPlayerRecord]] = relationship(
        back_populates="hand",
        cascade="all, delete-orphan",
    )
    actions: Mapped[list[ActionRecord]] = relationship(
        back_populates="hand",
        cascade="all, delete-orphan",
        order_by="ActionRecord.sequence_no",
    )
    pots: Mapped[list[PotRecord]] = relationship(
        back_populates="hand",
        cascade="all, delete-orphan",
        order_by="PotRecord.pot_number",
    )


class HandPlayerRecord(Base):
    __tablename__ = "hand_players"
    __table_args__ = (Index("ix_hand_players_account_id", "account_id"),)

    hand_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hands.hand_id", ondelete="CASCADE"),
        primary_key=True,
    )
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.account_id", ondelete="RESTRICT"),
        primary_key=True,
    )
    hole_cards: Mapped[list[str] | None] = mapped_column(JSONB)
    folded: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    all_in: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    shown: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    invested_chips: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=0,
        server_default=text("0"),
    )
    won_chips: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=0,
        server_default=text("0"),
    )

    hand: Mapped[HandRecord] = relationship(back_populates="players")


class ActionRecord(Base):
    __tablename__ = "actions"
    __table_args__ = (
        UniqueConstraint("hand_id", "sequence_no", name="uq_actions_hand_id_sequence_no"),
        Index("ix_actions_hand_id", "hand_id"),
        Index("ix_actions_account_id", "account_id"),
    )

    action_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    hand_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hands.hand_id", ondelete="CASCADE"),
        nullable=False,
    )
    sequence_no: Mapped[int] = mapped_column(Integer, nullable=False)
    state_version: Mapped[int] = mapped_column(Integer, nullable=False)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.account_id", ondelete="RESTRICT"),
        nullable=False,
    )
    street: Mapped[str] = mapped_column(String(16), nullable=False)
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    amount: Mapped[int | None] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    hand: Mapped[HandRecord] = relationship(back_populates="actions")


class PotRecord(Base):
    __tablename__ = "pots"
    __table_args__ = (
        UniqueConstraint("hand_id", "pot_number", name="uq_pots_hand_id_pot_number"),
        Index("ix_pots_hand_id", "hand_id"),
    )

    pot_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    hand_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hands.hand_id", ondelete="CASCADE"),
        nullable=False,
    )
    pot_number: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
    eligible_account_ids: Mapped[list[int]] = mapped_column(JSONB, nullable=False)
    winner_payouts: Mapped[dict[str, int]] = mapped_column(JSONB, nullable=False)

    hand: Mapped[HandRecord] = relationship(back_populates="pots")


__all__ = [
    "ActionRecord",
    "HandPlayerRecord",
    "HandRecord",
    "MatchPlayerRecord",
    "MatchRecord",
    "PotRecord",
]
