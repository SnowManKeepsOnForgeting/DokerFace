from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.game_engine.contracts import ActionType
from app.realtime.schemas import (
    GameActionEvent,
    GameLegalAction,
    GamePlayerSnapshot,
    GamePrivateSnapshot,
    GamePublicSnapshot,
    GameRequestSnapshotEvent,
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
        "status": "waiting",
        "members": [{"account_id": 1, "ready": True, "seat": None, "connected": True}],
        "match_id": None,
    }


def test_game_action_and_snapshot_events_validate_identifiers() -> None:
    match_id = uuid4()
    hand_id = uuid4()
    event = GameActionEvent(
        command_id=uuid4(),
        match_id=match_id,
        hand_id=hand_id,
        state_version=3,
        action=ActionType.FOLD,
    )
    request = GameRequestSnapshotEvent(match_id=match_id)

    assert event.action.value == "fold"
    assert event.amount is None
    assert request.match_id == match_id


def test_game_action_rejects_unknown_fields_and_negative_amounts() -> None:
    payload = {
        "command_id": uuid4(),
        "match_id": uuid4(),
        "hand_id": uuid4(),
        "state_version": 0,
        "action": ActionType.BET_OR_RAISE,
        "amount": -1,
    }

    with pytest.raises(ValidationError):
        GameActionEvent.model_validate(payload)
    with pytest.raises(ValidationError):
        GameActionEvent.model_validate({**payload, "amount": 100, "extra": True})


def test_public_and_private_snapshot_shapes_keep_hole_cards_private() -> None:
    deadline = datetime(2026, 7, 16, 12, 30, tzinfo=UTC)
    public = GamePublicSnapshot(
        match_id=uuid4(),
        hand_id=uuid4(),
        hand_number=1,
        state_version=0,
        street="preflop",
        button_account_id=1,
        actor_account_id=1,
        board=[],
        pot_amounts=[150],
        complete=False,
        server_time=deadline,
        action_deadline_at=deadline,
        players=[
            GamePlayerSnapshot(
                account_id=1,
                seat=0,
                display_name="Alice",
                stack=950,
                bet=50,
                folded=False,
                all_in=False,
            )
        ],
    )
    private = GamePrivateSnapshot(
        **public.model_dump(),
        account_id=1,
        hole_cards=["As", "Kd"],
        legal_actions=[GameLegalAction(action=ActionType.FOLD)],
    )

    assert "hole_cards" not in public.model_dump()
    assert private.hole_cards == ["As", "Kd"]
    assert private.action_deadline_at == deadline
    assert public.model_dump(mode="json")["action_deadline_at"] == "2026-07-16T12:30:00Z"
    assert public.server_time == deadline
