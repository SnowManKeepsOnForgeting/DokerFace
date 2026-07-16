from datetime import UTC, datetime, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.matches.models import MatchPlayerRecord, MatchRecord
from app.ratings.models import RatingBatch, RatingChangeRecord, RatingRecord
from app.ratings.service import RatingService


def make_match(started_at: datetime) -> MatchRecord:
    match_id = uuid4()
    return MatchRecord(
        match_id=match_id,
        room_id=uuid4(),
        rules_snapshot={},
        end_mode="winner_takes_all",
        status="complete",
        started_at=started_at,
        players=[
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
        ],
    )


@pytest.mark.asyncio
async def test_rating_replay_ignores_matches_from_previous_batches() -> None:
    batch_time = datetime(2026, 7, 16, 12, 0, tzinfo=UTC)
    batch = RatingBatch(batch_id=uuid4(), created_at=batch_time)
    ratings = [
        RatingRecord(
            batch_id=batch.batch_id,
            account_id=1,
            rating=Decimal("1000"),
            highest_rating=Decimal("1000"),
            completed_matches=0,
        ),
        RatingRecord(
            batch_id=batch.batch_id,
            account_id=2,
            rating=Decimal("1000"),
            highest_rating=Decimal("1000"),
            completed_matches=0,
        ),
    ]
    old_match = make_match(batch_time - timedelta(seconds=1))
    new_match = make_match(batch_time + timedelta(seconds=1))
    rating_rows = MagicMock()
    rating_rows.all.return_value = ratings
    rating_rows.__iter__.return_value = iter(ratings)
    match_rows = MagicMock()
    match_rows.all.return_value = [new_match]
    session = AsyncMock(spec=AsyncSession)
    session.scalar.return_value = batch
    session.scalars = AsyncMock(side_effect=[rating_rows, match_rows])

    await RatingService().rebuild_current_batch(session)

    changes = [
        call.args[0]
        for call in session.add.call_args_list
        if isinstance(call.args[0], RatingChangeRecord)
    ]
    assert len(changes) == 2
    assert {change.match_id for change in changes} == {new_match.match_id}
    assert all(rating.completed_matches == 1 for rating in ratings)
    match_query = session.scalars.call_args_list[1].args[0]
    assert "matches.started_at >=" in str(match_query)
    assert old_match.match_id != new_match.match_id
