from collections.abc import AsyncIterator
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account, AccountRole, AccountStatus
from app.auth.dependencies import get_current_account
from app.config import Settings
from app.db.dependencies import get_db_session
from app.main import create_app
from app.ratings.models import RatingBatch, RatingRecord


def make_account(account_id: int, role: AccountRole = AccountRole.PLAYER) -> Account:
    return Account(
        account_id=account_id,
        login_name=f"account-{account_id}",
        password_hash="stored-hash",
        role=role,
        status=AccountStatus.ACTIVE,
    )


def build_app(session: AsyncSession, account: Account) -> FastAPI:
    app = create_app(Settings(database_url="sqlite+aiosqlite:///:memory:"))

    async def override_db_session() -> AsyncIterator[AsyncSession]:
        yield session

    async def override_current_account() -> Account:
        return account

    app.dependency_overrides[get_db_session] = override_db_session
    app.dependency_overrides[get_current_account] = override_current_account
    return app


@pytest.mark.asyncio
async def test_leaderboard_uses_stable_rating_tiebreakers() -> None:
    session = AsyncMock(spec=AsyncSession)
    batch = RatingBatch(
        batch_id=uuid4(),
        created_at=datetime(2026, 7, 16, 12, 0, tzinfo=UTC),
    )
    entries = [
        RatingRecord(
            batch_id=batch.batch_id,
            account_id=2,
            rating=1100,
            highest_rating=1100,
            completed_matches=1,
        ),
        RatingRecord(
            batch_id=batch.batch_id,
            account_id=1,
            rating=1100,
            highest_rating=1050,
            completed_matches=1,
        ),
    ]
    scalar_results = [batch, 2]
    session.scalar.side_effect = scalar_results
    result = MagicMock()
    result.all.return_value = entries
    session.scalars.return_value = result
    app = build_app(session, make_account(1))

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/leaderboard")

    assert response.status_code == 200
    assert [item["account_id"] for item in response.json()["items"]] == [2, 1]
    assert [item["rank"] for item in response.json()["items"]] == [1, 2]


@pytest.mark.asyncio
async def test_administrator_can_reset_ratings_for_active_accounts() -> None:
    session = AsyncMock(spec=AsyncSession)
    session.scalars.return_value = MagicMock(all=lambda: [make_account(1), make_account(2)])
    session.scalar.side_effect = [2]
    app = build_app(session, make_account(9, AccountRole.ADMINISTRATOR))

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/v1/admin/rating-resets")

    assert response.status_code == 201
    assert response.json()["initial_rating"] == 1000
    assert response.json()["account_count"] == 2
    assert session.commit.await_count == 1
    session.add_all.assert_called_once()
    assert len(session.add_all.call_args.args[0]) == 2


@pytest.mark.asyncio
async def test_player_cannot_reset_ratings() -> None:
    session = AsyncMock(spec=AsyncSession)
    app = build_app(session, make_account(1))

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/v1/admin/rating-resets")

    assert response.status_code == 403
    session.commit.assert_not_awaited()
