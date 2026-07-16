import asyncio
from uuid import uuid4

import pytest

from app.game_engine.actor import (
    MatchActor,
    MatchActorStateError,
    MatchCommand,
    MatchCommandConflictError,
)
from app.game_engine.contracts import ActionCommand, ActionType
from app.game_engine.match import MatchCoordinator
from app.rooms.config import MatchEndMode, RoomRules


def make_rules() -> RoomRules:
    return RoomRules.model_validate(
        {
            "max_players": 2,
            "end_mode": MatchEndMode.WINNER_TAKES_ALL,
            "fixed_hand_count": None,
            "starting_chips": 1000,
            "small_blind": 50,
            "big_blind": 100,
            "ante": 0,
            "decision_timeout_seconds": None,
            "blind_increase_every_hands": 2,
            "show_remaining_board": False,
            "winner_may_show_hand": False,
            "spectators_allowed": False,
            "auto_start": False,
            "counted_in_stats": True,
            "allow_mid_match_join": False,
            "allow_rebuys": False,
            "allow_voluntary_leave": False,
        }
    )


@pytest.mark.asyncio
async def test_actor_requires_start_and_serializes_duplicate_commands() -> None:
    actor = MatchActor(MatchCoordinator((1, 2), make_rules()))
    command = MatchCommand(uuid4(), ActionCommand(1, ActionType.FOLD))

    with pytest.raises(MatchActorStateError):
        await actor.submit(command)

    await actor.start()
    first, second = await asyncio.gather(actor.submit(command), actor.submit(command))

    assert first.replayed is False
    assert second.replayed is True
    assert first.result is second.result
    assert first.result.command_id == command.command_id
    assert first.result.applied.action is ActionType.FOLD
    assert first.result.state_version == 1
    assert first.result.snapshot.state_version == 1
    assert actor.state_version == 1
    assert actor.coordinator.hand_number == 2
    await actor.close()


@pytest.mark.asyncio
async def test_actor_returns_error_for_out_of_turn_command_without_stopping() -> None:
    actor = MatchActor(MatchCoordinator((1, 2), make_rules()))
    await actor.start()

    with pytest.raises(ValueError):
        await actor.submit(MatchCommand(uuid4(), ActionCommand(2, ActionType.FOLD)))

    valid = await actor.submit(MatchCommand(uuid4(), ActionCommand(1, ActionType.FOLD)))
    assert valid.result.applied.account_id == 1
    await actor.close()


@pytest.mark.asyncio
async def test_actor_exposes_initial_private_snapshot_and_validates_state_identity() -> None:
    match_id = uuid4()
    actor = MatchActor(MatchCoordinator((1, 2), make_rules()), match_id=match_id)
    initial = await actor.start()

    assert initial.match_id == match_id
    assert initial.hand_number == 1
    assert initial.public.state_version == 0
    assert initial.action_deadline_at is None
    assert actor.private_snapshot(1).hole_cards

    with pytest.raises(MatchCommandConflictError):
        await actor.submit(
            MatchCommand(
                command_id=uuid4(),
                action=ActionCommand(1, ActionType.FOLD),
                match_id=uuid4(),
                hand_id=initial.hand_id,
                state_version=0,
            )
        )

    response = await actor.submit(
        MatchCommand(
            command_id=uuid4(),
            action=ActionCommand(1, ActionType.FOLD),
            match_id=match_id,
            hand_id=initial.hand_id,
            state_version=0,
        )
    )
    assert response.result.match_id == match_id
    assert response.result.hand_id != initial.hand_id
    assert response.result.settled_hand_id == initial.hand_id
    assert response.result.snapshot.street == "preflop"
    await actor.close()
