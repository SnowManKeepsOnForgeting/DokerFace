from collections.abc import Awaitable, Callable
from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.accounts.models import Account, AccountRole, AccountStatus
from app.config import Settings
from app.main import create_app
from app.matches.registry import MatchRegistry, MatchRuntime


def make_account() -> Account:
    return Account(
        account_id=7,
        login_name="alice",
        password_hash="stored-hash",
        role=AccountRole.PLAYER,
        status=AccountStatus.ACTIVE,
    )


Handler = Callable[..., Awaitable[Any]]


def get_handler(server: Any, event: str) -> Handler:
    return cast(Handler, server.handlers["/"][event])


def test_socketio_server_registers_match_runtime_registry() -> None:
    app = create_app(Settings(database_url="sqlite+aiosqlite:///:memory:"))

    assert isinstance(app.state.match_registry, MatchRegistry)
    assert get_handler(app.state.socketio, "room:start")
    assert get_handler(app.state.socketio, "game:action")
    assert get_handler(app.state.socketio, "game:request-snapshot")


@pytest.mark.asyncio
async def test_socketio_connect_rejects_missing_cookie() -> None:
    app = create_app(Settings(database_url="sqlite+aiosqlite:///:memory:"))
    handler = get_handler(app.state.socketio, "connect")

    assert callable(handler)
    accepted = await handler("sid", {"HTTP_ORIGIN": "http://localhost:5173"}, None)

    assert accepted is False


@pytest.mark.asyncio
async def test_socketio_connect_authenticates_and_replaces_old_sid(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(database_url="sqlite+aiosqlite:///:memory:")
    app = create_app(settings)
    account = make_account()

    class FakeSessionService:
        def __init__(self, session_ttl_hours: int) -> None:
            assert session_ttl_hours == settings.session_ttl_hours

        async def authenticate(self, db_session: object, token: str) -> Account:
            assert token == "valid-token"
            return account

    monkeypatch.setattr("app.realtime.server.SessionService", FakeSessionService)
    database = MagicMock()
    database.session_factory.return_value.__aenter__ = AsyncMock(return_value=object())
    database.session_factory.return_value.__aexit__ = AsyncMock(return_value=None)
    app.state.database = database

    server = app.state.socketio
    server.save_session = AsyncMock()
    server.disconnect = AsyncMock()
    server.enter_room = AsyncMock()
    server.emit = AsyncMock()
    room_id = uuid4()
    app.state.room_registry.ensure_room(room_id, host_account_id=7, max_players=2)
    app.state.room_registry.join(room_id, account_id=7, sid="sid-old")
    match_id = uuid4()
    app.state.match_registry.add(MatchRuntime(room_id, match_id, MagicMock(), ()))
    first_handler = get_handler(server, "connect")
    disconnect_handler = get_handler(server, "disconnect")
    assert callable(first_handler)
    assert callable(disconnect_handler)

    first = await first_handler(
        "sid-old",
        {
            "HTTP_ORIGIN": "http://localhost:5173",
            "HTTP_COOKIE": "dokerface_session=valid-token",
        },
        None,
    )
    second = await first_handler(
        "sid-new",
        {
            "HTTP_ORIGIN": "http://localhost:5173",
            "HTTP_COOKIE": "dokerface_session=valid-token",
        },
        None,
    )

    assert first is True
    assert second is True
    assert app.state.connection_registry.sid_for_account(7) == "sid-new"
    runtime = app.state.room_registry.get(room_id)
    assert runtime is not None
    assert runtime.members[7].sid == "sid-new"
    assert runtime.members[7].connected is True
    room_snapshot = cast(dict[str, Any], server.emit.await_args_list[-1].args[1])
    assert room_snapshot["match_id"] == str(match_id)
    await disconnect_handler("sid-old")
    assert app.state.connection_registry.sid_for_account(7) == "sid-new"
    assert runtime.members[7].connected is True
    await disconnect_handler("sid-new")
    assert runtime.members[7].connected is False
