"""SQLAlchemy models for rating batches and per-match changes."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RatingBatch(Base):
    __tablename__ = "rating_batches"
    __table_args__ = (Index("ix_rating_batches_created_at", "created_at"),)

    batch_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    created_by_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("accounts.account_id", ondelete="RESTRICT"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class RatingRecord(Base):
    __tablename__ = "ratings"
    __table_args__ = (Index("ix_ratings_account_id", "account_id"),)

    batch_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("rating_batches.batch_id", ondelete="CASCADE"),
        primary_key=True,
    )
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.account_id", ondelete="RESTRICT"),
        primary_key=True,
    )
    rating: Mapped[Decimal] = mapped_column(
        Numeric(12, 4),
        nullable=False,
        default=Decimal("1000.0000"),
        server_default="1000.0000",
    )
    highest_rating: Mapped[Decimal] = mapped_column(
        Numeric(12, 4),
        nullable=False,
        default=Decimal("1000.0000"),
        server_default="1000.0000",
    )
    completed_matches: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )


class RatingChangeRecord(Base):
    __tablename__ = "rating_changes"
    __table_args__ = (
        UniqueConstraint(
            "batch_id",
            "match_id",
            "account_id",
            name="uq_rating_changes_batch_match_account",
        ),
        Index("ix_rating_changes_account_id_created_at", "account_id", "created_at"),
        Index("ix_rating_changes_match_id", "match_id"),
    )

    rating_change_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    batch_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("rating_batches.batch_id", ondelete="CASCADE"),
        nullable=False,
    )
    match_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("matches.match_id", ondelete="RESTRICT"),
        nullable=False,
    )
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.account_id", ondelete="RESTRICT"),
        nullable=False,
    )
    before_rating: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    delta: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    after_rating: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    finishing_rank: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


__all__ = ["RatingBatch", "RatingChangeRecord", "RatingRecord"]
