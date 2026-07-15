from collections.abc import AsyncIterator
from typing import cast
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account, AccountRole, AccountStatus, Profile
from app.auth.dependencies import get_current_account
from app.config import Settings
from app.db.dependencies import get_db_session
from app.main import create_app


def make_account(
    *,
    account_id: int,
    login_name: str,
    role: AccountRole,
    status: AccountStatus = AccountStatus.ACTIVE,
) -> Account:
    return Account(
        account_id=account_id,
        login_name=login_name,
        password_hash="stored-hash",
        role=role,
        status=status,
        profile=Profile(display_name=login_name.title(), avatar_text=login_name.title()),
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


async def test_admin_api_creates_account() -> None:
    session = AsyncMock(spec=AsyncSession)
    admin = make_account(account_id=1, login_name="admin", role=AccountRole.ADMINISTRATOR)

    async def assign_identity() -> None:
        assert session.add.call_args is not None
        account = cast(Account, session.add.call_args.args[0])
        account.account_id = 2
        account.status = AccountStatus.ACTIVE

    session.scalar.return_value = None
    session.flush.side_effect = assign_identity
    app = build_app(session, admin)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/admin/accounts",
            json={
                "login_name": "alice",
                "password": "player password",
                "display_name": "Alice",
            },
        )

    assert response.status_code == 201
    assert response.json()["account_id"] == 2
    assert response.json()["display_name"] == "Alice"


async def test_admin_api_disables_account() -> None:
    session = AsyncMock(spec=AsyncSession)
    admin = make_account(account_id=1, login_name="admin", role=AccountRole.ADMINISTRATOR)
    target = make_account(account_id=2, login_name="alice", role=AccountRole.PLAYER)
    session.scalar.return_value = target
    app = build_app(session, admin)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.patch(
            "/api/v1/admin/accounts/2",
            json={"status": "disabled"},
        )

    assert response.status_code == 200
    assert response.json()["status"] == "disabled"
    assert session.commit.await_count == 1


async def test_admin_api_resets_password() -> None:
    session = AsyncMock(spec=AsyncSession)
    admin = make_account(account_id=1, login_name="admin", role=AccountRole.ADMINISTRATOR)
    target = make_account(account_id=2, login_name="alice", role=AccountRole.PLAYER)
    session.scalar.return_value = target
    app = build_app(session, admin)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/admin/accounts/2/reset-password",
            json={"password": "new password"},
        )

    assert response.status_code == 200
    assert response.json()["account_id"] == 2
    assert session.commit.await_count == 1


async def test_admin_api_rejects_player() -> None:
    session = AsyncMock(spec=AsyncSession)
    player = make_account(account_id=2, login_name="alice", role=AccountRole.PLAYER)
    app = build_app(session, player)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/admin/accounts",
            json={"login_name": "bob", "password": "player password"},
        )

    assert response.status_code == 403
    session.scalar.assert_not_awaited()


@pytest.mark.asyncio
async def test_admin_api_rejects_empty_update() -> None:
    session = AsyncMock(spec=AsyncSession)
    admin = make_account(account_id=1, login_name="admin", role=AccountRole.ADMINISTRATOR)
    app = build_app(session, admin)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.patch("/api/v1/admin/accounts/2", json={})

    assert response.status_code == 400
