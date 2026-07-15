from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account, AccountRole, AccountStatus
from app.auth.dependencies import get_current_account
from app.config import Settings
from app.db.dependencies import get_db_session
from app.main import create_app
from app.rooms.config import MatchEndMode, RoomVisibility
from app.rooms.models import Room, RoomStatus


def make_account() -> Account:
    return Account(
        account_id=1,
        login_name="alice",
        password_hash="stored-hash",
        role=AccountRole.PLAYER,
        status=AccountStatus.ACTIVE,
    )


def rules_payload() -> dict[str, object]:
    return {
        "max_players": 2,
        "end_mode": MatchEndMode.WINNER_TAKES_ALL.value,
        "starting_chips": 1000,
        "small_blind": 50,
        "big_blind": 100,
        "ante": 0,
        "decision_timeout_seconds": 30,
        "blind_increase_every_hands": 10,
        "show_remaining_board": False,
        "winner_may_show_hand": True,
        "spectators_allowed": False,
        "auto_start": False,
        "counted_in_stats": True,
        "allow_mid_match_join": False,
        "allow_rebuys": False,
        "allow_voluntary_leave": False,
    }


def build_app(session: AsyncSession, current_account: Account) -> FastAPI:
    app = create_app(Settings(database_url="sqlite+aiosqlite:///:memory:"))

    async def override_db_session() -> AsyncIterator[AsyncSession]:
        yield session

    async def override_current_account() -> Account:
        return current_account

    app.dependency_overrides[get_db_session] = override_db_session
    app.dependency_overrides[get_current_account] = override_current_account
    return app


async def test_player_can_create_password_room_without_exposing_secret() -> None:
    session = AsyncMock(spec=AsyncSession)
    account = make_account()

    async def assign_room_id() -> None:
        room = session.add.call_args.args[0]
        assert isinstance(room, Room)
        room.room_id = uuid4()

    session.flush.side_effect = assign_room_id
    app = build_app(session, account)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/rooms",
            json={
                "name": "Private table",
                "visibility": "password",
                "password": "table password",
                "rules": rules_payload(),
            },
        )

    assert response.status_code == 201
    body = response.json()
    assert UUID(body["room_id"])
    assert body["host_account_id"] == 1
    assert body["visibility"] == "password"
    assert body["has_password"] is True
    assert "password" not in body
    assert "password_hash" not in body
    room = session.add.call_args.args[0]
    assert isinstance(room, Room)
    assert room.password_hash is not None
    assert room.password_hash != "table password"
    session.commit.assert_awaited_once()


async def test_player_can_list_non_closed_rooms() -> None:
    session = AsyncMock(spec=AsyncSession)
    first_room = Room(
        room_id=uuid4(),
        host_account_id=1,
        name="Open table",
        visibility=RoomVisibility.PUBLIC,
        rules=rules_payload(),
        status=RoomStatus.WAITING,
    )
    closed_room = Room(
        room_id=uuid4(),
        host_account_id=1,
        name="Closed table",
        visibility=RoomVisibility.PUBLIC,
        rules=rules_payload(),
        status=RoomStatus.CLOSED,
    )
    result = MagicMock()
    result.all.return_value = [first_room]
    session.scalars.return_value = result
    app = build_app(session, make_account())

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/rooms")

    assert response.status_code == 200
    assert response.json()["items"][0]["name"] == "Open table"
    assert response.json()["items"][0]["status"] == "waiting"
    assert closed_room.name not in {item["name"] for item in response.json()["items"]}


async def test_room_detail_returns_not_found_for_missing_room() -> None:
    session = AsyncMock(spec=AsyncSession)
    session.scalar.return_value = None
    app = build_app(session, make_account())
    room_id = uuid4()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(f"/api/v1/rooms/{room_id}")

    assert response.status_code == 404


async def test_password_visibility_requires_password() -> None:
    session = AsyncMock(spec=AsyncSession)
    app = build_app(session, make_account())

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/rooms",
            json={
                "name": "Private table",
                "visibility": "password",
                "rules": rules_payload(),
            },
        )

    assert response.status_code == 422
    session.commit.assert_not_awaited()
