from typing import Any
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.config import Settings
from app.main import create_app
from app.realtime.room_handlers import register_room_handlers
from app.realtime.schemas import RoomSnapshot
from app.rooms.config import RoomVisibility
from app.rooms.models import Room, RoomStatus
from app.rooms.registry import RoomRegistry


def rules_payload() -> dict[str, object]:
    return {
        "max_players": 2,
        "end_mode": "winner_takes_all",
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


def make_room(room_id: Any) -> Room:
    return Room(
        room_id=room_id,
        host_account_id=1,
        name="Open table",
        visibility=RoomVisibility.PUBLIC,
        rules=rules_payload(),
        status=RoomStatus.WAITING,
    )


def room_handlers(server: Any, app: Any) -> dict[str, Any]:
    register_room_handlers(
        server,
        app,
        Settings(database_url="sqlite+aiosqlite:///:memory:"),
        RoomRegistry(),
    )
    return server.handlers["/"]


@pytest.mark.asyncio
async def test_join_initializes_runtime_enters_socket_room_and_broadcasts_snapshot() -> None:
    app = create_app(Settings(database_url="sqlite+aiosqlite:///:memory:"))
    server = MagicMock()
    server.handlers = {"/": {}}

    def register(event: str) -> Any:
        def decorator(handler: Any) -> Any:
            server.handlers["/"][event] = handler
            return handler

        return decorator

    server.on.side_effect = register
    server.get_session = AsyncMock(return_value={"account_id": 1})
    server.enter_room = AsyncMock()
    server.emit = AsyncMock()
    db_session = AsyncMock()
    db_session.scalar.return_value = make_room(uuid4())
    database = MagicMock()
    database.session_factory.return_value.__aenter__ = AsyncMock(return_value=db_session)
    database.session_factory.return_value.__aexit__ = AsyncMock(return_value=None)
    app.state.database = database
    room_id = db_session.scalar.return_value.room_id

    handlers = room_handlers(server, app)
    response = await handlers["room:join"]("sid-1", {"room_id": str(room_id)})

    assert response["ok"] is True
    assert response["room"]["status"] == "waiting"
    assert response["room"]["members"] == [{"account_id": 1, "ready": False, "seat": None}]
    server.enter_room.assert_awaited_once_with("sid-1", str(room_id))
    emitted = server.emit.await_args.args
    assert emitted[0] == "room:snapshot"
    RoomSnapshot.model_validate(emitted[1])


@pytest.mark.asyncio
async def test_ready_updates_snapshot_and_host_leave_is_rejected() -> None:
    app = create_app(Settings(database_url="sqlite+aiosqlite:///:memory:"))
    server = MagicMock()
    server.handlers = {"/": {}}

    def register(event: str) -> Any:
        def decorator(handler: Any) -> Any:
            server.handlers["/"][event] = handler
            return handler

        return decorator

    server.on.side_effect = register
    server.get_session = AsyncMock(return_value={"account_id": 1})
    server.enter_room = AsyncMock()
    server.leave_room = AsyncMock()
    server.emit = AsyncMock()
    db_session = AsyncMock()
    room_id = uuid4()
    db_session.scalar.return_value = make_room(room_id)
    database = MagicMock()
    database.session_factory.return_value.__aenter__ = AsyncMock(return_value=db_session)
    database.session_factory.return_value.__aexit__ = AsyncMock(return_value=None)
    app.state.database = database
    handlers = room_handlers(server, app)

    await handlers["room:join"]("sid-1", {"room_id": str(room_id)})
    ready_response = await handlers["room:ready"]("sid-1", {"room_id": str(room_id), "ready": True})
    leave_response = await handlers["room:leave"]("sid-1", {"room_id": str(room_id)})

    assert ready_response["room"]["members"] == [{"account_id": 1, "ready": True, "seat": None}]
    assert leave_response == {"ok": False, "error": "host_leave_policy_required"}
    server.leave_room.assert_not_awaited()
