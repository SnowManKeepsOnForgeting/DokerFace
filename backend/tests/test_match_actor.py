import asyncio
from uuid import uuid4

import pytest

from app.game_engine.actor import MatchActor, MatchActorStateError, MatchCommand
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

    assert first is second
    assert first.command_id == command.command_id
    assert first.applied.action is ActionType.FOLD
    assert first.state_version == 1
    assert first.snapshot.state_version == 1
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
    assert valid.applied.account_id == 1
    await actor.close()
