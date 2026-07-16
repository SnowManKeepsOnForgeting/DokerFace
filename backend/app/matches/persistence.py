"""Transactional persistence for completed match history."""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, cast

from sqlalchemy import select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from app.matches.models import (
    ActionRecord,
    HandPlayerRecord,
    HandRecord,
    MatchPlayerRecord,
    MatchRecord,
    PotRecord,
)


@dataclass(frozen=True)
class MatchPlayerSeed:
    account_id: int
    seat: int
    display_name: str
    initial_chips: int


@dataclass(frozen=True)
class ActionHistory:
    sequence_no: int
    state_version: int
    account_id: int
    street: str
    action: str
    amount: int | None


@dataclass(frozen=True)
class HandPlayerHistory:
    account_id: int
    hole_cards: tuple[str, ...] | None
    folded: bool
    all_in: bool
    shown: bool
    invested_chips: int
    won_chips: int


@dataclass(frozen=True)
class PotHistory:
    pot_number: int
    amount: int
    eligible_account_ids: tuple[int, ...]
    winner_payouts: dict[str, int]


@dataclass(frozen=True)
class HandHistory:
    hand_id: uuid.UUID
    match_id: uuid.UUID
    hand_number: int
    button_account_id: int
    small_blind: int
    big_blind: int
    public_board: tuple[str, ...]
    settlement_summary: dict[str, object]
    players: tuple[HandPlayerHistory, ...]
    actions: tuple[ActionHistory, ...]
    pots: tuple[PotHistory, ...]
    settled_at: datetime | None = None


@dataclass(frozen=True)
class MatchResult:
    account_id: int
    final_chips: int
    finishing_rank: int | None
    exit_reason: str | None = None


async def _in_transaction(
    session: AsyncSession,
    operation: Callable[[], Awaitable[None]],
) -> None:
    if session.in_transaction():
        await operation()
        await session.flush()
        return
    async with session.begin():
        await operation()
        await session.flush()


class MatchHistoryPersistenceService:
    async def create_match(
        self,
        session: AsyncSession,
        *,
        match_id: uuid.UUID,
        room_id: uuid.UUID,
        rules_snapshot: dict[str, object],
        end_mode: str,
        players: Sequence[MatchPlayerSeed],
        started_at: datetime | None = None,
    ) -> None:
        async def operation() -> None:
            session.add(
                MatchRecord(
                    match_id=match_id,
                    room_id=room_id,
                    rules_snapshot=rules_snapshot,
                    end_mode=end_mode,
                    status="active",
                    started_at=started_at or datetime.now(UTC),
                    players=[
                        MatchPlayerRecord(
                            match_id=match_id,
                            account_id=player.account_id,
                            seat=player.seat,
                            display_name=player.display_name,
                            initial_chips=player.initial_chips,
                        )
                        for player in players
                    ],
                )
            )

        await _in_transaction(session, operation)

    async def persist_hand(
        self,
        session: AsyncSession,
        history: HandHistory,
    ) -> None:
        async def operation() -> None:
            session.add(
                HandRecord(
                    hand_id=history.hand_id,
                    match_id=history.match_id,
                    hand_number=history.hand_number,
                    button_account_id=history.button_account_id,
                    small_blind=history.small_blind,
                    big_blind=history.big_blind,
                    status="settled",
                    public_board=list(history.public_board),
                    settlement_summary=history.settlement_summary,
                    settled_at=history.settled_at or datetime.now(UTC),
                    players=[
                        HandPlayerRecord(
                            hand_id=history.hand_id,
                            account_id=player.account_id,
                            hole_cards=list(player.hole_cards)
                            if player.hole_cards is not None
                            else None,
                            folded=player.folded,
                            all_in=player.all_in,
                            shown=player.shown,
                            invested_chips=player.invested_chips,
                            won_chips=player.won_chips,
                        )
                        for player in history.players
                    ],
                    actions=[
                        ActionRecord(
                            hand_id=history.hand_id,
                            sequence_no=action.sequence_no,
                            state_version=action.state_version,
                            account_id=action.account_id,
                            street=action.street,
                            action=action.action,
                            amount=action.amount,
                        )
                        for action in history.actions
                    ],
                    pots=[
                        PotRecord(
                            hand_id=history.hand_id,
                            pot_number=pot.pot_number,
                            amount=pot.amount,
                            eligible_account_ids=list(pot.eligible_account_ids),
                            winner_payouts=pot.winner_payouts,
                        )
                        for pot in history.pots
                    ],
                )
            )

        await _in_transaction(session, operation)

    async def complete_match(
        self,
        session: AsyncSession,
        *,
        match_id: uuid.UUID,
        results: Sequence[MatchResult],
        completed_at: datetime | None = None,
    ) -> None:
        async def operation() -> None:
            match = await session.scalar(
                select(MatchRecord).where(MatchRecord.match_id == match_id).with_for_update()
            )
            if match is None:
                raise ValueError("Match history record was not found")
            if match.status != "active":
                raise ValueError("Only active matches can be completed")
            players = {
                player.account_id: player
                for player in await session.scalars(
                    select(MatchPlayerRecord).where(MatchPlayerRecord.match_id == match_id)
                )
            }
            result_by_account = {result.account_id: result for result in results}
            if len(result_by_account) != len(results) or set(result_by_account) != set(players):
                raise ValueError("Match results must contain every seated player exactly once")
            match.status = "complete"
            match.completed_at = completed_at or datetime.now(UTC)
            for account_id, result in result_by_account.items():
                player = players[account_id]
                player.final_chips = result.final_chips
                player.finishing_rank = result.finishing_rank
                player.exit_reason = result.exit_reason

        await _in_transaction(session, operation)

    async def void_active_matches(
        self,
        session: AsyncSession,
        *,
        reason: str,
        voided_at: datetime | None = None,
    ) -> int:
        voided_at = voided_at or datetime.now(UTC)
        voided_count = 0

        async def operation() -> None:
            nonlocal voided_count
            result = await session.execute(
                update(MatchRecord)
                .where(MatchRecord.status == "active")
                .values(status="void", void_reason=reason, completed_at=voided_at)
            )
            voided_count = cast(CursorResult[Any], result).rowcount or 0

        await _in_transaction(session, operation)
        return voided_count


__all__ = [
    "ActionHistory",
    "HandHistory",
    "HandPlayerHistory",
    "MatchHistoryPersistenceService",
    "MatchPlayerSeed",
    "MatchResult",
    "PotHistory",
]
