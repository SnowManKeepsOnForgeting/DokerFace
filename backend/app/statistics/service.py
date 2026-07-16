"""Transactional persistence for reduced statistics counters."""

from __future__ import annotations

from collections.abc import Mapping

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.statistics.models import PlayerStatisticsRecord
from app.statistics.reducer import (
    STATISTICS_REDUCER_VERSION,
    PlayerStatistics,
    StatisticsHand,
    reduce_hand,
)


class StatisticsPersistenceService:
    async def apply_hand(self, session: AsyncSession, hand: StatisticsHand) -> None:
        deltas = reduce_hand(hand)
        for account_id, delta in deltas.items():
            record = await self._get_or_create(session, account_id)
            self._add_delta(record, delta)

    async def apply_profitable_matches(
        self,
        session: AsyncSession,
        results: Mapping[int, bool],
    ) -> None:
        for account_id, profitable in results.items():
            record = await self._get_or_create(session, account_id)
            record.profitable_matches += int(profitable)

    async def _get_or_create(
        self,
        session: AsyncSession,
        account_id: int,
    ) -> PlayerStatisticsRecord:
        record = await session.scalar(
            select(PlayerStatisticsRecord)
            .where(PlayerStatisticsRecord.account_id == account_id)
            .with_for_update()
        )
        if record is not None:
            if record.reducer_version != STATISTICS_REDUCER_VERSION:
                raise ValueError("Stored statistics reducer version is unsupported")
            return record
        record = PlayerStatisticsRecord(
            account_id=account_id,
            reducer_version=STATISTICS_REDUCER_VERSION,
            position_counts={},
        )
        session.add(record)
        return record

    @staticmethod
    def _add_delta(record: PlayerStatisticsRecord, delta: PlayerStatistics) -> None:
        for field_name in (
            "dealt_hands",
            "won_hands",
            "vpip_opportunities",
            "vpip",
            "pfr_opportunities",
            "pfr",
            "three_bet_opportunities",
            "three_bets",
            "showdown_opportunities",
            "showdowns",
            "showdown_wins",
            "decisions",
            "folds",
            "all_ins",
            "pot_total",
            "pot_count",
        ):
            setattr(record, field_name, getattr(record, field_name) + getattr(delta, field_name))
        positions = record.position_counts.copy()
        for position, count in delta.position_counts.items():
            positions[position] = positions.get(position, 0) + count
        record.position_counts = positions


__all__ = ["StatisticsPersistenceService"]
