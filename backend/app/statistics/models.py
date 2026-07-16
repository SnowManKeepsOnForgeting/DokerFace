"""Persistent counter storage for rebuilt player statistics."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PlayerStatisticsRecord(Base):
    __tablename__ = "player_stats"

    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.account_id", ondelete="RESTRICT"),
        primary_key=True,
    )
    reducer_version: Mapped[int] = mapped_column(Integer, nullable=False)
    dealt_hands: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    won_hands: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    profitable_matches: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    vpip_opportunities: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    vpip: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pfr_opportunities: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pfr: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    three_bet_opportunities: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    three_bets: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    showdown_opportunities: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    showdowns: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    showdown_wins: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    decisions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    folds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    all_ins: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pot_total: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    pot_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    position_counts: Mapped[dict[str, int]] = mapped_column(JSONB, nullable=False, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


__all__ = ["PlayerStatisticsRecord"]
