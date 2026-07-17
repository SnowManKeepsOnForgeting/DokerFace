from collections.abc import AsyncIterator
from typing import cast
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account, AccountRole, AccountStatus, Profile
from app.auth.dependencies import get_current_account
from app.config import Settings
from app.db.dependencies import get_db_session
from app.main import create_app
from app.matches.models import MatchRecord
from app.rooms.config import RoomVisibility
from app.rooms.models import Room, RoomStatus
from app.rooms.registry import RoomRegistry


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


class StaleRoomRegistry(RoomRegistry):
    def seed_stale_membership(self, account_id: int, room_id: UUID) -> None:
        self._account_to_room[account_id] = room_id


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


async def test_admin_api_can_void_a_match_with_a_reason(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = AsyncMock(spec=AsyncSession)
    admin = make_account(account_id=1, login_name="admin", role=AccountRole.ADMINISTRATOR)
    match = MatchRecord(
        match_id=uuid4(),
        room_id=uuid4(),
        rules_snapshot={},
        end_mode="winner_takes_all",
        status="complete",
    )
    session.scalar.return_value = match
    session.begin = MagicMock()
    session.begin.return_value.__aenter__ = AsyncMock(return_value=session)
    session.begin.return_value.__aexit__ = AsyncMock(return_value=None)
    rating_service = MagicMock()
    rating_service.rebuild_current_batch = AsyncMock()
    monkeypatch.setattr("app.admin.api.RatingService", lambda: rating_service)
    app = build_app(session, admin)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            f"/api/v1/admin/matches/{match.match_id}/void",
            json={"reason": "manual review"},
        )

    assert response.status_code == 200
    assert response.json()["status"] == "void"
    assert response.json()["void_reason"] == "manual review"
    rating_service.rebuild_current_batch.assert_awaited_once()


@pytest.mark.asyncio
async def test_admin_api_rejects_empty_update() -> None:
    session = AsyncMock(spec=AsyncSession)
    admin = make_account(account_id=1, login_name="admin", role=AccountRole.ADMINISTRATOR)
    app = build_app(session, admin)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.patch("/api/v1/admin/accounts/2", json={})

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_admin_api_close_room_clears_realtime_membership() -> None:
    session = AsyncMock(spec=AsyncSession)
    admin = make_account(account_id=1, login_name="admin", role=AccountRole.ADMINISTRATOR)
    room = Room(
        room_id=uuid4(),
        host_account_id=1,
        name="Open table",
        visibility=RoomVisibility.PUBLIC,
        rules={},
    )
    session.scalar.return_value = room
    app = build_app(session, admin)

    room_registry = RoomRegistry()
    room_registry.ensure_room(room.room_id, host_account_id=1, max_players=2)
    room_registry.join(room.room_id, account_id=2, sid="sid-player")
    app.state.room_registry = room_registry

    socketio_server = MagicMock()
    socketio_server.emit = AsyncMock()
    socketio_server.leave_room = AsyncMock()
    app.state.socketio = socketio_server

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(f"/api/v1/admin/rooms/{room.room_id}/close")

    assert response.status_code == 204
    assert room.status is RoomStatus.CLOSED
    assert room_registry.get(room.room_id) is None
    assert room_registry.room_for_account(2) is None
    socketio_server.leave_room.assert_awaited_once_with("sid-player", str(room.room_id))

    replacement_room_id = uuid4()
    room_registry.ensure_room(replacement_room_id, host_account_id=2, max_players=2)
    room_registry.join(replacement_room_id, account_id=2, sid="sid-player-new")


@pytest.mark.asyncio
async def test_admin_api_close_room_clears_stale_index_without_runtime() -> None:
    session = AsyncMock(spec=AsyncSession)
    admin = make_account(account_id=1, login_name="admin", role=AccountRole.ADMINISTRATOR)
    room = Room(
        room_id=uuid4(),
        host_account_id=1,
        name="Stale table",
        visibility=RoomVisibility.PUBLIC,
        rules={},
    )
    session.scalar.return_value = room
    app = build_app(session, admin)

    room_registry = StaleRoomRegistry()
    room_registry.seed_stale_membership(2, room.room_id)
    app.state.room_registry = room_registry

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(f"/api/v1/admin/rooms/{room.room_id}/close")

    assert response.status_code == 204
    assert room_registry.room_for_account(2) is None

    replacement_room_id = uuid4()
    room_registry.ensure_room(replacement_room_id, host_account_id=2, max_players=2)
    room_registry.join(replacement_room_id, account_id=2, sid="sid-player-new")
