from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account, AccountRole, AccountStatus, Profile
from app.auth.dependencies import get_current_account
from app.config import Settings
from app.db.dependencies import get_db_session
from app.main import create_app


def make_account(account_id: int, login_name: str) -> Account:
    return Account(
        account_id=account_id,
        login_name=login_name,
        password_hash="stored-hash",
        role=AccountRole.PLAYER,
        status=AccountStatus.ACTIVE,
        profile=Profile(display_name=login_name.title(), rank_badge_theme="default"),
    )


def build_app(session: AsyncSession, current_account: Account) -> FastAPI:
    app = create_app(Settings(database_url="sqlite+aiosqlite:///:memory:"))

    async def override_db_session() -> AsyncIterator[AsyncSession]:
        yield session

    async def override_current_account() -> Account:
        return current_account

    app.dependency_overrides[get_db_session] = override_db_session
    app.dependency_overrides[get_current_account] = override_current_account
    return app


async def test_player_list_returns_public_profiles() -> None:
    session = AsyncMock(spec=AsyncSession)
    current_account = make_account(1, "alice")
    listed_accounts = [current_account, make_account(2, "bob")]
    scalar_result = MagicMock()
    scalar_result.all.return_value = listed_accounts
    session.scalar.return_value = 2
    session.scalars.return_value = scalar_result
    app = build_app(session, current_account)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/players?offset=0&limit=20")

    assert response.status_code == 200
    assert response.json() == {
        "items": [
            {
                "account_id": 1,
                "display_name": "Alice",
                "avatar_path": None,
                "rank_badge_theme": "default",
            },
            {
                "account_id": 2,
                "display_name": "Bob",
                "avatar_path": None,
                "rank_badge_theme": "default",
            },
        ],
        "total": 2,
        "offset": 0,
        "limit": 20,
    }


async def test_player_detail_returns_public_profile() -> None:
    session = AsyncMock(spec=AsyncSession)
    current_account = make_account(1, "alice")
    session.scalar.return_value = make_account(2, "bob")
    app = build_app(session, current_account)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/players/2")

    assert response.status_code == 200
    assert response.json()["display_name"] == "Bob"
    assert "login_name" not in response.json()


async def test_player_detail_returns_not_found_for_missing_player() -> None:
    session = AsyncMock(spec=AsyncSession)
    current_account = make_account(1, "alice")
    session.scalar.return_value = None
    app = build_app(session, current_account)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/players/99")

    assert response.status_code == 404


async def test_player_can_update_own_profile() -> None:
    session = AsyncMock(spec=AsyncSession)
    current_account = make_account(1, "alice")
    app = build_app(session, current_account)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.patch(
            "/api/v1/me/profile",
            json={"display_name": "New Alice", "rank_badge_theme": "blue"},
        )

    assert response.status_code == 200
    assert response.json()["display_name"] == "New Alice"
    assert response.json()["rank_badge_theme"] == "blue"
    assert current_account.profile is not None
    assert current_account.profile.display_name == "New Alice"
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_profile_update_requires_a_field() -> None:
    session = AsyncMock(spec=AsyncSession)
    app = build_app(session, make_account(1, "alice"))

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.patch("/api/v1/me/profile", json={})

    assert response.status_code == 400
    session.commit.assert_not_awaited()
