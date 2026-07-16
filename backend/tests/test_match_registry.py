from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.game_engine.actor import MatchActor
from app.matches.registry import MatchPlayer, MatchRegistry, MatchRuntime, MatchRuntimeError


class FakeActor(MatchActor):
    def __init__(self) -> None:
        self.close_mock = AsyncMock()

    async def close(self) -> None:
        await self.close_mock()


def make_runtime() -> MatchRuntime:
    actor = FakeActor()
    return MatchRuntime(
        room_id=uuid4(),
        match_id=uuid4(),
        actor=actor,
        players=(
            MatchPlayer(account_id=1, seat=0, display_name="Alice"),
            MatchPlayer(account_id=2, seat=1, display_name="Bob"),
        ),
    )


def test_match_registry_indexes_runtime_by_room_and_match() -> None:
    registry = MatchRegistry()
    runtime = make_runtime()

    assert registry.add(runtime) is runtime
    assert registry.for_room(runtime.room_id) is runtime
    assert registry.for_match(runtime.match_id) is runtime
    assert runtime.player(2).seat == 1

    with pytest.raises(MatchRuntimeError):
        runtime.player(3)


def test_match_registry_rejects_duplicate_room_or_match() -> None:
    registry = MatchRegistry()
    first = make_runtime()
    second = make_runtime()
    second.room_id = first.room_id
    registry.add(first)

    with pytest.raises(MatchRuntimeError):
        registry.add(second)


@pytest.mark.asyncio
async def test_match_registry_removes_runtime_and_closes_actor() -> None:
    registry = MatchRegistry()
    runtime = make_runtime()
    registry.add(runtime)

    await registry.remove(runtime)

    assert registry.for_room(runtime.room_id) is None
    assert registry.for_match(runtime.match_id) is None
    assert isinstance(runtime.actor, FakeActor)
    runtime.actor.close_mock.assert_awaited_once()
