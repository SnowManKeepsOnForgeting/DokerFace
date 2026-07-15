"""In-memory waiting-room membership state."""

from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID


class RoomRuntimeError(ValueError):
    """Base error for in-memory room membership operations."""


class RoomFullError(RoomRuntimeError):
    """Raised when a room has no available player slot."""


class AccountAlreadyInRoomError(RoomRuntimeError):
    """Raised when an account tries to join another room."""


class RoomMemberNotFoundError(RoomRuntimeError):
    """Raised when an account is not a member of the requested room."""


class HostLeaveRequiresPolicyError(RoomRuntimeError):
    """Raised until the product chooses a host-leave policy."""


@dataclass
class RoomMember:
    account_id: int
    sid: str
    ready: bool = False


def empty_members() -> dict[int, RoomMember]:
    return {}


@dataclass
class RoomRuntime:
    room_id: UUID
    host_account_id: int
    max_players: int
    members: dict[int, RoomMember] = field(default_factory=empty_members)


class RoomRegistry:
    def __init__(self) -> None:
        self._rooms: dict[UUID, RoomRuntime] = {}
        self._account_to_room: dict[int, UUID] = {}

    def ensure_room(self, room_id: UUID, host_account_id: int, max_players: int) -> RoomRuntime:
        room = self._rooms.get(room_id)
        if room is None:
            room = RoomRuntime(
                room_id=room_id,
                host_account_id=host_account_id,
                max_players=max_players,
            )
            self._rooms[room_id] = room
        return room

    def join(self, room_id: UUID, account_id: int, sid: str) -> RoomRuntime:
        room = self._require_room(room_id)
        existing_room_id = self._account_to_room.get(account_id)
        if existing_room_id is not None and existing_room_id != room_id:
            raise AccountAlreadyInRoomError("Account is already in another room")

        member = room.members.get(account_id)
        if member is not None:
            member.sid = sid
            return room
        if len(room.members) >= room.max_players:
            raise RoomFullError("Room has no available player slot")

        room.members[account_id] = RoomMember(account_id=account_id, sid=sid)
        self._account_to_room[account_id] = room_id
        return room

    def set_ready(self, room_id: UUID, account_id: int, ready: bool) -> RoomRuntime:
        room = self._require_room(room_id)
        member = room.members.get(account_id)
        if member is None:
            raise RoomMemberNotFoundError("Account is not a member of this room")
        member.ready = ready
        return room

    def leave(self, room_id: UUID, account_id: int) -> RoomRuntime:
        room = self._require_room(room_id)
        if account_id == room.host_account_id:
            raise HostLeaveRequiresPolicyError("Host-leave policy is not configured")
        if room.members.pop(account_id, None) is None:
            raise RoomMemberNotFoundError("Account is not a member of this room")
        self._account_to_room.pop(account_id, None)
        return room

    def room_for_account(self, account_id: int) -> UUID | None:
        return self._account_to_room.get(account_id)

    def get(self, room_id: UUID) -> RoomRuntime | None:
        return self._rooms.get(room_id)

    def remove_if_empty(self, room_id: UUID) -> None:
        room = self._rooms.get(room_id)
        if room is not None and not room.members:
            self._rooms.pop(room_id, None)

    def _require_room(self, room_id: UUID) -> RoomRuntime:
        room = self._rooms.get(room_id)
        if room is None:
            raise RoomRuntimeError("Room runtime is not initialized")
        return room


__all__ = [
    "AccountAlreadyInRoomError",
    "HostLeaveRequiresPolicyError",
    "RoomFullError",
    "RoomMemberNotFoundError",
    "RoomRegistry",
    "RoomRuntimeError",
]
