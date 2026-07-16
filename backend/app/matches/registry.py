"""In-memory registry for active matches."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from app.game_engine.actor import MatchActor


class MatchRuntimeError(ValueError):
    """Raised when an active match runtime cannot satisfy an operation."""


@dataclass(frozen=True)
class MatchPlayer:
    account_id: int
    seat: int
    display_name: str


@dataclass
class MatchRuntime:
    room_id: UUID
    match_id: UUID
    actor: MatchActor
    players: tuple[MatchPlayer, ...]

    def player(self, account_id: int) -> MatchPlayer:
        for player in self.players:
            if player.account_id == account_id:
                return player
        raise MatchRuntimeError("Account is not seated in this match")


class MatchRegistry:
    def __init__(self) -> None:
        self._by_room: dict[UUID, MatchRuntime] = {}
        self._by_match: dict[UUID, MatchRuntime] = {}

    def add(self, runtime: MatchRuntime) -> MatchRuntime:
        if runtime.room_id in self._by_room or runtime.match_id in self._by_match:
            raise MatchRuntimeError("Room already has an active match")
        self._by_room[runtime.room_id] = runtime
        self._by_match[runtime.match_id] = runtime
        return runtime

    def for_room(self, room_id: UUID) -> MatchRuntime | None:
        return self._by_room.get(room_id)

    def for_match(self, match_id: UUID) -> MatchRuntime | None:
        return self._by_match.get(match_id)

    async def remove(self, runtime: MatchRuntime) -> None:
        self._by_room.pop(runtime.room_id, None)
        self._by_match.pop(runtime.match_id, None)
        await runtime.actor.close()


__all__ = ["MatchPlayer", "MatchRegistry", "MatchRuntime", "MatchRuntimeError"]
