"""Transactional persistence for reduced statistics counters."""

from __future__ import annotations

from collections.abc import Mapping

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.game_engine.contracts import ActionType
from app.matches.models import HandRecord, MatchRecord
from app.statistics.models import PlayerStatisticsRecord
from app.statistics.reducer import (
    STATISTICS_REDUCER_VERSION,
    MatchResult,
    PlayerStatistics,
    StatisticsAction,
    StatisticsHand,
    StatisticsMatch,
    StatisticsPlayer,
    rebuild_statistics,
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
            record.matches_played += 1
            record.profitable_matches += int(profitable)

    async def rebuild_from_history(self, session: AsyncSession) -> dict[int, PlayerStatistics]:
        matches = list(
            (
                await session.scalars(
                    select(MatchRecord)
                    .options(
                        selectinload(MatchRecord.players),
                        selectinload(MatchRecord.hands).selectinload(HandRecord.players),
                        selectinload(MatchRecord.hands).selectinload(HandRecord.actions),
                        selectinload(MatchRecord.hands).selectinload(HandRecord.pots),
                    )
                    .where(MatchRecord.status == "complete")
                    .order_by(MatchRecord.started_at, MatchRecord.match_id)
                )
            ).all()
        )
        statistics_matches = tuple(
            _to_statistics_match(match)
            for match in matches
            if match.rules_snapshot.get("counted_in_stats", True) is not False
        )
        totals = rebuild_statistics(statistics_matches)
        await session.execute(delete(PlayerStatisticsRecord))
        session.add_all(_to_records(totals))
        await session.flush()
        return totals

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
            dealt_hands=0,
            won_hands=0,
            matches_played=0,
            profitable_matches=0,
            vpip_opportunities=0,
            vpip=0,
            pfr_opportunities=0,
            pfr=0,
            three_bet_opportunities=0,
            three_bets=0,
            showdown_opportunities=0,
            showdowns=0,
            showdown_wins=0,
            decisions=0,
            folds=0,
            all_ins=0,
            pot_total=0,
            pot_count=0,
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


def _to_statistics_match(match: MatchRecord) -> StatisticsMatch:
    ordered_players = tuple(sorted(match.players, key=lambda player: player.seat))
    account_ids = tuple(player.account_id for player in ordered_players)
    hands = tuple(
        _to_statistics_hand(hand, account_ids)
        for hand in sorted(match.hands, key=lambda hand: hand.hand_number)
        if hand.status == "settled"
    )
    results: dict[int, MatchResult] = {}
    for player in match.players:
        if player.final_chips is None:
            raise ValueError("Completed match is missing final chips")
        results[player.account_id] = (
            MatchResult.PROFIT
            if player.final_chips > player.initial_chips
            else MatchResult.LOSS
            if player.final_chips < player.initial_chips
            else MatchResult.TIE
        )
    return StatisticsMatch(match.match_id, hands, results)


def _positions(
    account_ids: tuple[int, ...],
    button_account_id: int,
) -> dict[int, str]:
    try:
        button_index = account_ids.index(button_account_id)
    except ValueError as error:
        raise ValueError("Hand button is not seated in the match") from error
    return {
        account_id: (
            "button"
            if index == button_index
            else "small_blind"
            if index == (button_index + 1) % len(account_ids)
            else "big_blind"
            if index == (button_index + 2) % len(account_ids)
            else f"seat_{index}"
        )
        for index, account_id in enumerate(account_ids)
    }


def _to_statistics_hand(
    hand: HandRecord,
    account_ids: tuple[int, ...],
) -> StatisticsHand:
    positions = _positions(account_ids, hand.button_account_id)
    action_values = tuple(
        StatisticsAction(
            account_id=action.account_id,
            street=action.street,
            action=ActionType(action.action),
            amount=action.amount,
        )
        for action in hand.actions
    )
    players = tuple(
        StatisticsPlayer(
            account_id=player.account_id,
            position=positions[player.account_id],
            folded=player.folded,
            all_in=player.all_in,
            won_chips=player.won_chips,
            showdown=player.shown,
        )
        for player in hand.players
    )
    return StatisticsHand(
        hand_id=hand.hand_id,
        match_id=hand.match_id,
        pot_amount=sum(pot.amount for pot in hand.pots),
        players=players,
        actions=action_values,
        reached_showdown=any(
            action.action in {ActionType.SHOW, ActionType.MUCK} for action in action_values
        ),
    )


def _to_records(totals: Mapping[int, PlayerStatistics]) -> list[PlayerStatisticsRecord]:
    return [
        PlayerStatisticsRecord(
            account_id=statistics.account_id,
            reducer_version=STATISTICS_REDUCER_VERSION,
            dealt_hands=statistics.dealt_hands,
            won_hands=statistics.won_hands,
            matches_played=statistics.matches_played,
            profitable_matches=statistics.profitable_matches,
            vpip_opportunities=statistics.vpip_opportunities,
            vpip=statistics.vpip,
            pfr_opportunities=statistics.pfr_opportunities,
            pfr=statistics.pfr,
            three_bet_opportunities=statistics.three_bet_opportunities,
            three_bets=statistics.three_bets,
            showdown_opportunities=statistics.showdown_opportunities,
            showdowns=statistics.showdowns,
            showdown_wins=statistics.showdown_wins,
            decisions=statistics.decisions,
            folds=statistics.folds,
            all_ins=statistics.all_ins,
            pot_total=statistics.pot_total,
            pot_count=statistics.pot_count,
            position_counts=statistics.position_counts,
        )
        for statistics in totals.values()
    ]


__all__ = ["StatisticsPersistenceService"]
