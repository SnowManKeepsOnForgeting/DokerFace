from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account, AccountRole, AccountStatus
from app.ratings.models import RatingBatch, RatingRecord
from app.ratings.service import RatingService


def make_account(account_id: int) -> Account:
    return Account(
        account_id=account_id,
        login_name=f"account-{account_id}",
        password_hash="stored-hash",
        role=AccountRole.PLAYER,
        status=AccountStatus.ACTIVE,
    )


@pytest.mark.asyncio
async def test_startup_rating_initialization_creates_batch_and_missing_records() -> None:
    session = AsyncMock(spec=AsyncSession)
    session.scalar.return_value = None
    session.flush = AsyncMock()
    accounts_result = MagicMock()
    accounts_result.all.return_value = [make_account(1), make_account(2)]
    existing_result = MagicMock()
    existing_result.all.return_value = []
    session.scalars.side_effect = [accounts_result, existing_result]

    batch = await RatingService().ensure_account_ratings(session)

    assert isinstance(batch, RatingBatch)
    assert batch.batch_id is not None
    session.add.assert_called_once_with(batch)
    session.add_all.assert_called_once()
    records = session.add_all.call_args.args[0]
    assert all(isinstance(record, RatingRecord) for record in records)
    assert {record.account_id for record in records} == {1, 2}
    assert {record.rating for record in records} == {1000}
    assert session.flush.await_count == 1


@pytest.mark.asyncio
async def test_startup_rating_initialization_is_idempotent_for_existing_batch() -> None:
    session = AsyncMock(spec=AsyncSession)
    batch = RatingBatch(batch_id=uuid4())
    session.scalar.return_value = batch
    session.flush = AsyncMock()
    accounts_result = MagicMock()
    accounts_result.all.return_value = [make_account(1)]
    existing_result = MagicMock()
    existing_result.all.return_value = [1]
    session.scalars.side_effect = [accounts_result, existing_result]

    result = await RatingService().ensure_account_ratings(session)

    assert result is batch
    session.add_all.assert_called_once_with([])
