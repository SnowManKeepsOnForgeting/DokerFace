from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.realtime.schemas import (
    RoomJoinEvent,
    RoomMemberSnapshot,
    RoomReadyEvent,
    RoomSnapshot,
)


def test_room_event_defaults_to_schema_version_one() -> None:
    event = RoomReadyEvent(room_id=uuid4(), ready=True)

    assert event.schema_version == 1


def test_room_join_event_rejects_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        RoomJoinEvent.model_validate({"room_id": uuid4(), "invitation_code": "unexpected"})


def test_room_snapshot_serializes_uuid_and_version() -> None:
    room_id = uuid4()
    snapshot = RoomSnapshot(
        room_id=room_id,
        host_account_id=1,
        members=[RoomMemberSnapshot(account_id=1, ready=True)],
    )

    assert snapshot.model_dump(mode="json") == {
        "schema_version": 1,
        "room_id": str(room_id),
        "host_account_id": 1,
        "members": [{"account_id": 1, "ready": True}],
    }
