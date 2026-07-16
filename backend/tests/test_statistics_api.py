from collections.abc import AsyncIterator
from unittest.mock import AsyncMock
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
from app.statistics.models import PlayerStatisticsRecord


def make_account(account_id: int) -> Account:
    return Account(
        account_id=account_id,
        login_name=f"player-{account_id}",
        password_hash="stored-hash",
        role=AccountRole.PLAYER,
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
async def test_statistics_endpoint_returns_counters_and_derived_rates() -> None:
    session = AsyncMock(spec=AsyncSession)
    account = make_account(1)
    record = PlayerStatisticsRecord(
        account_id=1,
        reducer_version=1,
        dealt_hands=4,
        won_hands=2,
        matches_played=3,
        profitable_matches=2,
        vpip_opportunities=4,
        vpip=2,
        pfr_opportunities=4,
        pfr=1,
        three_bet_opportunities=2,
        three_bets=1,
        showdown_opportunities=3,
        showdowns=2,
        showdown_wins=1,
        decisions=5,
        folds=1,
        all_ins=1,
        pot_total=600,
        pot_count=4,
        position_counts={"button": 2},
    )
    session.scalar.side_effect = [account, record]
    app = build_app(session, account)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/players/1/statistics")

    assert response.status_code == 200
    payload = response.json()
    assert payload["matches_played"] == 3
    assert payload["vpip_rate"] == 0.5
    assert payload["showdown_win_rate"] == 0.5
    assert payload["average_pot"] == 150.0


@pytest.mark.asyncio
async def test_statistics_endpoint_returns_null_for_missing_denominators() -> None:
    session = AsyncMock(spec=AsyncSession)
    account = make_account(1)
    session.scalar.side_effect = [account, None]
    app = build_app(session, account)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(f"/api/v1/players/1/statistics?unused={uuid4()}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["account_id"] == 1
    assert payload["dealt_hands"] == 0
    assert payload["vpip_rate"] is None
    assert payload["average_pot"] is None
