from uuid import uuid4

import pytest

from app.rooms.registry import (
    AccountAlreadyInRoomError,
    HostLeaveRequiresPolicyError,
    RoomFullError,
    RoomMemberNotFoundError,
    RoomRegistry,
)


def test_join_is_idempotent_and_reconnect_updates_sid() -> None:
    registry = RoomRegistry()
    room_id = uuid4()
    registry.ensure_room(room_id, host_account_id=1, max_players=2)

    room = registry.join(room_id, account_id=1, sid="old-sid")
    room = registry.set_ready(room_id, account_id=1, ready=True)
    rejoined = registry.join(room_id, account_id=1, sid="new-sid")

    assert rejoined is room
    assert room.members[1].sid == "new-sid"
    assert room.members[1].ready is True


def test_room_capacity_and_cross_room_membership_are_enforced() -> None:
    registry = RoomRegistry()
    first_room = uuid4()
    second_room = uuid4()
    registry.ensure_room(first_room, host_account_id=1, max_players=1)
    registry.ensure_room(second_room, host_account_id=2, max_players=2)
    registry.join(first_room, account_id=1, sid="sid-1")

    with pytest.raises(RoomFullError):
        registry.join(first_room, account_id=2, sid="sid-2")
    with pytest.raises(AccountAlreadyInRoomError):
        registry.join(second_room, account_id=1, sid="sid-1b")


def test_ready_requires_membership() -> None:
    registry = RoomRegistry()
    room_id = uuid4()
    registry.ensure_room(room_id, host_account_id=1, max_players=2)

    with pytest.raises(RoomMemberNotFoundError):
        registry.set_ready(room_id, account_id=1, ready=True)


def test_host_leave_is_explicitly_blocked_until_policy_exists() -> None:
    registry = RoomRegistry()
    room_id = uuid4()
    registry.ensure_room(room_id, host_account_id=1, max_players=2)
    registry.join(room_id, account_id=1, sid="sid-1")

    with pytest.raises(HostLeaveRequiresPolicyError):
        registry.leave(room_id, account_id=1)


def test_non_host_can_leave_and_empty_runtime_can_be_removed() -> None:
    registry = RoomRegistry()
    room_id = uuid4()
    registry.ensure_room(room_id, host_account_id=1, max_players=2)
    registry.join(room_id, account_id=1, sid="sid-1")
    registry.join(room_id, account_id=2, sid="sid-2")

    registry.leave(room_id, account_id=2)
    assert registry.room_for_account(2) is None
    registry.remove_if_empty(room_id)
    assert registry.get(room_id) is not None


def test_reset_waiting_state_clears_seats_and_ready_flags() -> None:
    registry = RoomRegistry()
    room_id = uuid4()
    room = registry.ensure_room(room_id, host_account_id=1, max_players=2)
    registry.join(room_id, account_id=1, sid="sid-1")
    registry.join(room_id, account_id=2, sid="sid-2")
    registry.set_ready(room_id, account_id=1, ready=True)
    registry.set_ready(room_id, account_id=2, ready=True)
    room.members[1].seat = 0
    room.members[2].seat = 1

    registry.reset_waiting_state(room_id)

    assert all(member.ready is False for member in room.members.values())
    assert all(member.seat is None for member in room.members.values())
