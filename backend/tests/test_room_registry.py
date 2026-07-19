from uuid import uuid4

import pytest

from app.rooms.registry import (
    AccountAlreadyInRoomError,
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
    assert room.members[1].connected is True


def test_rebind_and_disconnect_ignore_an_old_sid() -> None:
    registry = RoomRegistry()
    room_id = uuid4()
    registry.ensure_room(room_id, host_account_id=1, max_players=2)
    registry.join(room_id, account_id=1, sid="old-sid")

    assert registry.rebind_sid(1, "new-sid") == room_id
    assert registry.disconnect_sid("old-sid") is None
    runtime = registry.get(room_id)
    assert runtime is not None
    assert runtime.members[1].connected is True
    assert registry.disconnect_sid("new-sid") == room_id
    assert runtime.members[1].connected is False


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


def test_host_leave_transfers_to_the_earliest_remaining_member() -> None:
    registry = RoomRegistry()
    room_id = uuid4()
    registry.ensure_room(room_id, host_account_id=1, max_players=2)
    registry.join(room_id, account_id=1, sid="sid-1")

    registry.join(room_id, account_id=2, sid="sid-2")

    room = registry.leave(room_id, account_id=1)

    assert room.host_account_id == 2
    assert 1 not in room.members


def test_close_removes_room_and_account_membership_indexes() -> None:
    registry = RoomRegistry()
    room_id = uuid4()
    replacement_room_id = uuid4()
    registry.ensure_room(room_id, host_account_id=1, max_players=2)
    registry.ensure_room(replacement_room_id, host_account_id=2, max_players=2)
    registry.join(room_id, account_id=1, sid="sid-1")

    members = registry.close(room_id)

    assert [member.account_id for member in members] == [1]
    assert registry.get(room_id) is None
    assert registry.room_for_account(1) is None
    registry.join(replacement_room_id, account_id=1, sid="sid-1-new")


def test_host_leave_removes_an_empty_runtime() -> None:
    registry = RoomRegistry()
    room_id = uuid4()
    registry.ensure_room(room_id, host_account_id=1, max_players=2)
    registry.join(room_id, account_id=1, sid="sid-1")

    registry.leave(room_id, account_id=1)
    registry.remove_if_empty(room_id)

    assert registry.get(room_id) is None


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
