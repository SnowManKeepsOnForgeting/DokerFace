from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account, AccountRole, AccountSession, AccountStatus, Profile
from app.auth.passwords import PasswordService
from app.config import Settings
from app.db.dependencies import get_db_session
from app.main import create_app


def build_app(session: AsyncSession) -> FastAPI:
    app = create_app(
        Settings(
            database_url="sqlite+aiosqlite:///:memory:",
            session_ttl_hours=2,
        )
    )

    async def override_db_session() -> AsyncIterator[AsyncSession]:
        yield session

    app.dependency_overrides[get_db_session] = override_db_session
    return app


def make_account(
    *,
    login_name: str = "alice",
    status: AccountStatus = AccountStatus.ACTIVE,
) -> Account:
    return Account(
        account_id=1,
        login_name=login_name,
        password_hash=PasswordService().hash("correct password"),
        role=AccountRole.PLAYER,
        status=status,
        profile=Profile(display_name="Alice"),
    )


@pytest.mark.asyncio
async def test_login_creates_session_cookie_and_returns_current_user() -> None:
    session = AsyncMock(spec=AsyncSession)
    session.scalar.return_value = make_account()
    app = build_app(session)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/auth/login",
            json={"login_name": "alice", "password": "correct password", "remember": True},
        )

    assert response.status_code == 200
    assert response.json() == {
        "account_id": 1,
        "login_name": "alice",
        "role": "player",
        "status": "active",
        "display_name": "Alice",
    }
    assert "dokerface_session=" in response.headers["set-cookie"]
    assert "Max-Age=7200" in response.headers["set-cookie"]
    session.add.assert_called_once()
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("password", ["wrong password", ""])
async def test_login_rejects_bad_credentials(password: str) -> None:
    session = AsyncMock(spec=AsyncSession)
    session.scalar.return_value = make_account()
    app = build_app(session)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/auth/login",
            json={"login_name": "alice", "password": password},
        )

    assert response.status_code == 401
    session.add.assert_not_called()
    session.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_login_rejects_disabled_accounts() -> None:
    session = AsyncMock(spec=AsyncSession)
    session.scalar.return_value = make_account(status=AccountStatus.DISABLED)
    app = build_app(session)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/auth/login",
            json={"login_name": "alice", "password": "correct password"},
        )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_current_user_requires_and_uses_cookie_session() -> None:
    session = AsyncMock(spec=AsyncSession)
    account = make_account()
    session.scalar.return_value = AccountSession(
        account=account,
        token_hash="unused",
        expires_at=datetime.now(UTC) + timedelta(hours=1),
        last_activity_at=datetime.now(UTC),
    )
    app = build_app(session)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        missing_cookie_response = await client.get("/api/v1/me")
        client.cookies.set("dokerface_session", "valid-token")
        authenticated_response = await client.get("/api/v1/me")

    assert missing_cookie_response.status_code == 401
    assert authenticated_response.status_code == 200
    assert authenticated_response.json()["login_name"] == "alice"
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_logout_revokes_cookie_session() -> None:
    session = AsyncMock(spec=AsyncSession)
    session.scalar.return_value = AccountSession(
        account=make_account(),
        token_hash="unused",
        expires_at=datetime.now(UTC) + timedelta(hours=1),
        last_activity_at=datetime.now(UTC),
    )
    app = build_app(session)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        client.cookies.set("dokerface_session", "valid-token")
        response = await client.post("/api/v1/auth/logout")

    assert response.status_code == 204
    assert "dokerface_session=" in response.headers["set-cookie"]
    session.commit.assert_awaited_once()
