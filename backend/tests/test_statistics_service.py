from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.game_engine.contracts import ActionType
from app.matches.models import (
    ActionRecord,
    HandPlayerRecord,
    HandRecord,
    MatchPlayerRecord,
    MatchRecord,
    PotRecord,
)
from app.statistics.models import PlayerStatisticsRecord
from app.statistics.service import StatisticsPersistenceService


def make_match(*, counted_in_stats: bool, match_id: UUID | None = None) -> MatchRecord:
    match_id = match_id or uuid4()
    hand_id = uuid4()
    players = [
        MatchPlayerRecord(
            match_id=match_id,
            account_id=1,
            seat=0,
            display_name="Alice",
            initial_chips=1000,
            final_chips=1200,
            finishing_rank=1,
        ),
        MatchPlayerRecord(
            match_id=match_id,
            account_id=2,
            seat=1,
            display_name="Bob",
            initial_chips=1000,
            final_chips=800,
            finishing_rank=2,
        ),
    ]
    hand = HandRecord(
        hand_id=hand_id,
        match_id=match_id,
        hand_number=1,
        button_account_id=1,
        small_blind=50,
        big_blind=100,
        status="settled",
        players=[
            HandPlayerRecord(
                hand_id=hand_id,
                account_id=1,
                folded=False,
                all_in=False,
                shown=False,
                invested_chips=100,
                won_chips=200,
            ),
            HandPlayerRecord(
                hand_id=hand_id,
                account_id=2,
                folded=True,
                all_in=False,
                shown=False,
                invested_chips=100,
                won_chips=0,
            ),
        ],
        actions=[
            ActionRecord(
                hand_id=hand_id,
                sequence_no=1,
                state_version=1,
                account_id=1,
                street="preflop",
                action=ActionType.BET_OR_RAISE.value,
                amount=100,
            ),
            ActionRecord(
                hand_id=hand_id,
                sequence_no=2,
                state_version=2,
                account_id=2,
                street="preflop",
                action=ActionType.FOLD.value,
            ),
        ],
        pots=[
            PotRecord(
                hand_id=hand_id,
                pot_number=1,
                amount=200,
                eligible_account_ids=[1, 2],
                winner_payouts={"1": 200},
            )
        ],
    )
    return MatchRecord(
        match_id=match_id,
        room_id=uuid4(),
        rules_snapshot={"counted_in_stats": counted_in_stats},
        end_mode="fixed_hands",
        status="complete",
        players=players,
        hands=[hand],
    )


@pytest.mark.asyncio
async def test_rebuild_from_history_filters_uncounted_matches() -> None:
    session = AsyncMock(spec=AsyncSession)
    result = MagicMock()
    result.all.return_value = [
        make_match(counted_in_stats=True),
        make_match(counted_in_stats=False),
    ]
    session.scalars.return_value = result
    session.flush = AsyncMock()

    totals = await StatisticsPersistenceService().rebuild_from_history(session)

    assert totals[1].matches_played == 1
    assert totals[1].dealt_hands == 1
    assert totals[1].profitable_matches == 1
    assert totals[1].pfr == 1
    assert totals[2].matches_played == 1
    assert totals[2].profitable_matches == 0
    session.execute.assert_awaited_once()
    session.add_all.assert_called_once()
    assert len(session.add_all.call_args.args[0]) == 2


@pytest.mark.asyncio
async def test_apply_profitable_matches_increments_completed_match_count() -> None:
    session = AsyncMock(spec=AsyncSession)
    session.scalar.return_value = None
    service = StatisticsPersistenceService()

    await service.apply_profitable_matches(session, {1: True, 2: False})

    records = [call.args[0] for call in session.add.call_args_list]
    assert all(isinstance(record, PlayerStatisticsRecord) for record in records)
    assert [record.matches_played for record in records] == [1, 1]
    assert [record.profitable_matches for record in records] == [1, 0]
