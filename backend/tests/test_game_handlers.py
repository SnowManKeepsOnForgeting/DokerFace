from __future__ import annotations

from random import Random
from typing import Any
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest

from app.accounts.models import Profile
from app.config import Settings
from app.main import create_app
from app.matches.persistence import MatchHistoryPersistenceService
from app.matches.registry import MatchRegistry
from app.ratings.service import RatingService
from app.realtime.room_handlers import (
    mark_account_disconnected,
    register_room_handlers,
    restore_account_connection,
)
from app.realtime.schemas import GamePrivateSnapshot, GamePublicSnapshot
from app.rooms.config import RoomVisibility
from app.rooms.models import Room, RoomStatus
from app.rooms.registry import RoomRegistry
from app.statistics.service import StatisticsPersistenceService


def rules_payload() -> dict[str, object]:
    return {
        "max_players": 2,
        "end_mode": "fixed_hands",
        "fixed_hand_count": 5,
        "starting_chips": 1000,
        "small_blind": 50,
        "big_blind": 100,
        "ante": 0,
        "decision_timeout_seconds": None,
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


def make_room(room_id: UUID) -> Room:
    return Room(
        room_id=room_id,
        host_account_id=1,
        name="Open table",
        visibility=RoomVisibility.PUBLIC,
        rules=rules_payload(),
        status=RoomStatus.WAITING,
    )


def make_handlers() -> tuple[dict[str, Any], Any, Room, MatchRegistry]:
    app = create_app(Settings(database_url="sqlite+aiosqlite:///:memory:"))
    room = make_room(uuid4())
    profiles = [
        Profile(account_id=1, display_name="Alice", avatar_text="A"),
        Profile(account_id=2, display_name="Bob", avatar_text="B"),
    ]
    server = MagicMock()
    server.handlers = {"/": {}}

    def register(event: str) -> Any:
        def decorator(handler: Any) -> Any:
            server.handlers["/"][event] = handler
            return handler

        return decorator

    async def session_for_sid(sid: str) -> dict[str, int]:
        return {"account_id": 1 if sid == "sid-1" else 2}

    server.on.side_effect = register
    server.get_session = session_for_sid
    server.enter_room = AsyncMock()
    server.leave_room = AsyncMock()
    server.emit = AsyncMock()

    db_session = AsyncMock()
    db_session.scalar = AsyncMock(return_value=room)
    db_session.begin = MagicMock()
    db_session.begin.return_value.__aenter__ = AsyncMock(return_value=db_session)
    db_session.begin.return_value.__aexit__ = AsyncMock(return_value=None)
    profile_result = MagicMock()
    profile_result.all.return_value = profiles
    db_session.scalars = AsyncMock(return_value=profile_result)
    database = MagicMock()
    database.session_factory.return_value.__aenter__ = AsyncMock(return_value=db_session)
    database.session_factory.return_value.__aexit__ = AsyncMock(return_value=None)
    app.state.database = database

    matches = MatchRegistry()
    room_registry = RoomRegistry()
    history = MagicMock(spec=MatchHistoryPersistenceService)
    history.create_match = AsyncMock()
    history.persist_hand = AsyncMock()
    history.complete_match = AsyncMock()
    history.void_match = AsyncMock()
    ratings = MagicMock(spec=RatingService)
    ratings.settle_match = AsyncMock()
    statistics = MagicMock(spec=StatisticsPersistenceService)
    statistics.apply_hand = AsyncMock()
    statistics.apply_profitable_matches = AsyncMock()
    server.history_service = history
    server.rating_service = ratings
    server.statistics_service = statistics
    register_room_handlers(
        server,
        app,
        Settings(database_url="sqlite+aiosqlite:///:memory:"),
        room_registry,
        matches,
        Random(7),
        history,
        ratings,
        statistics,
    )
    server.room_registry = room_registry
    return server.handlers["/"], server, room, matches


async def join_and_ready(handlers: dict[str, Any], room_id: UUID) -> None:
    await handlers["room:join"]("sid-1", {"room_id": str(room_id)})
    await handlers["room:join"]("sid-2", {"room_id": str(room_id)})
    await handlers["room:ready"]("sid-1", {"room_id": str(room_id), "ready": True})
    await handlers["room:ready"]("sid-2", {"room_id": str(room_id), "ready": True})


def emitted_payloads(server: Any, event_name: str) -> list[dict[str, Any]]:
    return [
        call.args[1]
        for call in server.emit.await_args_list
        if call.args and call.args[0] == event_name
    ]


@pytest.mark.asyncio
async def test_room_start_emits_public_and_private_initial_snapshots() -> None:
    handlers, server, room, matches = make_handlers()
    await join_and_ready(handlers, room.room_id)

    response = await handlers["room:start"]("sid-1", {"room_id": str(room.room_id)})

    assert response["ok"] is True
    assert room.status is RoomStatus.ACTIVE
    assert matches.for_room(room.room_id) is not None
    room_snapshot = response["room"]
    assert room_snapshot["status"] == "active"
    assert room_snapshot["match_id"] == response["match_id"]
    assert {member["seat"] for member in room_snapshot["members"]} == {0, 1}
    assert all(member["connected"] is True for member in room_snapshot["members"])

    public = GamePublicSnapshot.model_validate(emitted_payloads(server, "game:public-snapshot")[0])
    private_payloads = emitted_payloads(server, "game:private-snapshot")
    assert len(private_payloads) == 2
    assert public.state_version == 0
    assert public.action_deadline_at is None
    assert public.server_time.tzinfo is not None
    assert public.actions == []
    assert all(
        "hole_cards" not in payload for payload in emitted_payloads(server, "game:public-snapshot")
    )
    private = [GamePrivateSnapshot.model_validate(payload) for payload in private_payloads]
    assert {snapshot.account_id for snapshot in private} == {1, 2}
    assert all(len(snapshot.hole_cards) == 2 for snapshot in private)
    assert all(snapshot.match_id == UUID(response["match_id"]) for snapshot in private)


@pytest.mark.asyncio
async def test_room_start_requires_ready_players_and_host_authority() -> None:
    handlers, _, room, _ = make_handlers()
    await handlers["room:join"]("sid-1", {"room_id": str(room.room_id)})
    await handlers["room:join"]("sid-2", {"room_id": str(room.room_id)})
    await handlers["room:ready"]("sid-1", {"room_id": str(room.room_id), "ready": True})

    not_ready = await handlers["room:start"]("sid-1", {"room_id": str(room.room_id)})
    assert not_ready == {"ok": False, "error": "all_players_must_be_ready"}

    await handlers["room:ready"]("sid-2", {"room_id": str(room.room_id), "ready": True})
    not_host = await handlers["room:start"]("sid-2", {"room_id": str(room.room_id)})
    assert not_host == {"ok": False, "error": "host_required"}


@pytest.mark.asyncio
async def test_game_request_snapshot_targets_only_requesting_connection() -> None:
    handlers, server, room, _ = make_handlers()
    await join_and_ready(handlers, room.room_id)
    start = await handlers["room:start"]("sid-1", {"room_id": str(room.room_id)})
    server.emit.reset_mock()

    response = await handlers["game:request-snapshot"]("sid-1", {"match_id": start["match_id"]})

    assert response == {"ok": True, "match_id": start["match_id"]}
    assert [call.kwargs.get("to") for call in server.emit.await_args_list] == [
        "sid-1",
        "sid-1",
    ]


@pytest.mark.asyncio
async def test_game_action_deduplicates_and_rejects_stale_versions() -> None:
    handlers, server, room, matches = make_handlers()
    await join_and_ready(handlers, room.room_id)
    start = await handlers["room:start"]("sid-1", {"room_id": str(room.room_id)})
    initial = GamePublicSnapshot.model_validate(
        emitted_payloads(server, "game:public-snapshot")[-1]
    )
    actor_sid = "sid-1" if initial.actor_account_id == 1 else "sid-2"
    action = {
        "command_id": str(uuid4()),
        "match_id": start["match_id"],
        "hand_id": str(initial.hand_id),
        "state_version": initial.state_version,
        "action": "fold",
    }
    before = len(server.emit.await_args_list)

    first = await handlers["game:action"](actor_sid, action)
    after_first = len(server.emit.await_args_list)
    second = await handlers["game:action"](actor_sid, action)

    assert first["ok"] is True
    assert first["replayed"] is False
    assert second["replayed"] is True
    assert after_first > before
    assert len(server.emit.await_args_list) == after_first

    stale = dict(action)
    stale["command_id"] = str(uuid4())
    stale["state_version"] = 0
    current = GamePublicSnapshot.model_validate(
        emitted_payloads(server, "game:public-snapshot")[-1]
    )
    stale["hand_id"] = str(current.hand_id)
    rejected = await handlers["game:action"](actor_sid, stale)
    assert rejected == {
        "ok": False,
        "schema_version": 1,
        "command_id": stale["command_id"],
        "match_id": stale["match_id"],
        "hand_id": stale["hand_id"],
        "state_version": 0,
        "error": "stale_state_version",
    }
    assert emitted_payloads(server, "game:action-rejected")[-1]["error"] == "stale_state_version"
    assert matches.for_room(room.room_id) is not None


@pytest.mark.asyncio
async def test_match_completion_resets_room_to_waiting() -> None:
    handlers, server, room, matches = make_handlers()
    await join_and_ready(handlers, room.room_id)
    start = await handlers["room:start"]("sid-1", {"room_id": str(room.room_id)})

    for _ in range(5):
        public = GamePublicSnapshot.model_validate(
            emitted_payloads(server, "game:public-snapshot")[-1]
        )
        actor_sid = "sid-1" if public.actor_account_id == 1 else "sid-2"
        await handlers["game:action"](
            actor_sid,
            {
                "command_id": str(uuid4()),
                "match_id": start["match_id"],
                "hand_id": str(public.hand_id),
                "state_version": public.state_version,
                "action": "fold",
            },
        )

    assert matches.for_room(room.room_id) is None
    assert room.status is RoomStatus.WAITING
    assert emitted_payloads(server, "game:match-settled")[-1]["status"] == "complete"
    waiting = emitted_payloads(server, "room:snapshot")[-1]
    assert waiting["status"] == "waiting"
    assert all(member["ready"] is False for member in waiting["members"])


@pytest.mark.asyncio
async def test_hand_settlement_is_emitted_before_the_next_hand_snapshot() -> None:
    handlers, server, room, _ = make_handlers()
    await join_and_ready(handlers, room.room_id)
    start = await handlers["room:start"]("sid-1", {"room_id": str(room.room_id)})
    public = GamePublicSnapshot.model_validate(
        emitted_payloads(server, "game:public-snapshot")[-1]
    )
    server.emit.reset_mock()
    actor_sid = "sid-1" if public.actor_account_id == 1 else "sid-2"
    response = await handlers["game:action"](
        actor_sid,
        {
            "command_id": str(uuid4()),
            "match_id": start["match_id"],
            "hand_id": str(public.hand_id),
            "state_version": public.state_version,
            "action": "fold",
        },
    )

    assert response["ok"] is True
    assert [call.args[0] for call in server.emit.await_args_list] == [
        "game:hand-settled",
        "game:public-snapshot",
        "game:private-snapshot",
        "game:private-snapshot",
    ]


@pytest.mark.asyncio
async def test_uncounted_match_skips_statistics_but_settles_history_and_ratings() -> None:
    handlers, server, room, matches = make_handlers()
    room.rules["counted_in_stats"] = False
    await join_and_ready(handlers, room.room_id)
    start = await handlers["room:start"]("sid-1", {"room_id": str(room.room_id)})

    for _ in range(5):
        public = GamePublicSnapshot.model_validate(
            emitted_payloads(server, "game:public-snapshot")[-1]
        )
        actor_sid = "sid-1" if public.actor_account_id == 1 else "sid-2"
        await handlers["game:action"](
            actor_sid,
            {
                "command_id": str(uuid4()),
                "match_id": start["match_id"],
                "hand_id": str(public.hand_id),
                "state_version": public.state_version,
                "action": "fold",
            },
        )

    assert matches.for_room(room.room_id) is None
    server.statistics_service.apply_hand.assert_not_awaited()
    server.statistics_service.apply_profitable_matches.assert_not_awaited()
    assert server.history_service.persist_hand.await_count == 5
    server.history_service.complete_match.assert_awaited_once()
    server.rating_service.settle_match.assert_awaited_once()


@pytest.mark.asyncio
async def test_backend_match_flow_recovers_connection_and_settles_all_layers() -> None:
    handlers, server, room, matches = make_handlers()
    await join_and_ready(handlers, room.room_id)
    start = await handlers["room:start"]("sid-1", {"room_id": str(room.room_id)})

    await mark_account_disconnected(
        server,
        server.room_registry,
        matches,
        "sid-1",
        1,
    )
    runtime = server.room_registry.get(room.room_id)
    assert runtime is not None
    assert runtime.members[1].connected is False
    await restore_account_connection(server, server.room_registry, matches, 1, "sid-1")
    assert runtime.members[1].connected is True
    assert server.emit.await_args_list[-1].args[1]["match_id"] == start["match_id"]

    for _ in range(5):
        public = GamePublicSnapshot.model_validate(
            emitted_payloads(server, "game:public-snapshot")[-1]
        )
        actor_sid = "sid-1" if public.actor_account_id == 1 else "sid-2"
        response = await handlers["game:action"](
            actor_sid,
            {
                "command_id": str(uuid4()),
                "match_id": start["match_id"],
                "hand_id": str(public.hand_id),
                "state_version": public.state_version,
                "action": "fold",
            },
        )
        assert response["ok"] is True

    assert matches.for_room(room.room_id) is None
    assert server.history_service.persist_hand.await_count == 5
    server.history_service.complete_match.assert_awaited_once()
    server.rating_service.settle_match.assert_awaited_once()
    assert server.statistics_service.apply_hand.await_count == 5
    server.statistics_service.apply_profitable_matches.assert_awaited_once()
    assert len(emitted_payloads(server, "game:hand-settled")) == 5
    assert emitted_payloads(server, "game:match-settled")[-1]["status"] == "complete"
    assert emitted_payloads(server, "room:snapshot")[-1]["status"] == "waiting"
