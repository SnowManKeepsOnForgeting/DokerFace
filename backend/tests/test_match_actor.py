import asyncio
from datetime import UTC, datetime
from uuid import uuid4

import pytest

from app.game_engine.actor import (
    MatchActor,
    MatchActorStateError,
    MatchCommand,
    MatchCommandConflictError,
    MatchCommandSource,
)
from app.game_engine.contracts import ActionCommand, ActionType
from app.game_engine.match import MatchCoordinator, MatchStatus
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
    assert first.result.completed_hand is not None
    assert first.result.completed_hand.actions[0].sequence_no == 1
    assert first.result.completed_hand.actions[0].account_id == 1
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
    completed = response.result.completed_hand
    assert completed is not None
    assert completed.hand_id == initial.hand_id
    assert completed.actions[0].state_version == 1
    assert completed.actions[0].action is ActionType.FOLD
    assert completed.starting_stacks == (1000, 1000)
    assert completed.small_blind == 50
    assert completed.big_blind == 100
    assert set(completed.private_snapshots) == {1, 2}
    await actor.close()


@pytest.mark.asyncio
async def test_quit_can_be_submitted_by_a_non_current_player_and_ends_the_match() -> None:
    match_id = uuid4()
    actor = MatchActor(MatchCoordinator((1, 2), make_rules()), match_id=match_id)
    initial = await actor.start()

    response = await actor.submit(
        MatchCommand(
            command_id=uuid4(),
            action=ActionCommand(2, ActionType.FOLD),
            match_id=match_id,
            hand_id=initial.hand_id,
            state_version=initial.public.state_version,
            quit=True,
        )
    )

    assert response.result.applied.account_id == 2
    assert response.result.applied.action is ActionType.FOLD
    assert response.result.quit_account_id == 2
    assert response.result.match_status is MatchStatus.COMPLETE
    assert response.result.settlement is not None
    assert response.result.settlement.final_stacks == (2000, 0)
    assert response.result.completed_hand is not None
    assert response.result.completed_hand.public.folded == (False, True)
    await actor.close()


@pytest.mark.asyncio
async def test_timeout_command_requires_identity_and_folds_current_actor() -> None:
    match_id = uuid4()
    actor = MatchActor(MatchCoordinator((1, 2), make_rules()), match_id=match_id)
    initial = await actor.start()

    with pytest.raises(MatchCommandConflictError, match="Timeout command"):
        await actor.submit(
            MatchCommand(
                uuid4(),
                ActionCommand(1, ActionType.FOLD),
                source=MatchCommandSource.TIMEOUT,
            )
        )

    response = await actor.submit_timeout(
        uuid4(),
        match_id=match_id,
        hand_id=initial.hand_id,
        state_version=initial.public.state_version,
    )

    assert response.result.applied.action is ActionType.FOLD
    assert response.result.applied.account_id == initial.public.actor_account_id
    assert response.result.state_version == 1
    await actor.close()


@pytest.mark.asyncio
async def test_player_and_disconnect_timeout_commands_are_serialized_by_version() -> None:
    match_id = uuid4()
    actor = MatchActor(MatchCoordinator((1, 2), make_rules()), match_id=match_id)
    initial = await actor.start()
    player_command = MatchCommand(
        uuid4(),
        ActionCommand(initial.public.actor_account_id or 1, ActionType.FOLD),
        match_id=match_id,
        hand_id=initial.hand_id,
        state_version=0,
    )
    timeout_task = actor.submit_timeout(
        uuid4(),
        match_id=match_id,
        hand_id=initial.hand_id,
        state_version=0,
        source=MatchCommandSource.DISCONNECT_TIMEOUT,
    )
    player_task = actor.submit(player_command)
    results = await asyncio.gather(timeout_task, player_task, return_exceptions=True)

    assert sum(not isinstance(result, Exception) for result in results) == 1
    assert sum(isinstance(result, MatchCommandConflictError) for result in results) == 1
    assert actor.state_version == 1
    await actor.close()


@pytest.mark.asyncio
async def test_finite_action_timer_folds_and_refreshes_the_deadline() -> None:
    release = asyncio.Event()
    sleeper_calls = 0

    async def sleeper(seconds: float) -> object:
        nonlocal sleeper_calls
        assert seconds == 1
        sleeper_calls += 1
        if sleeper_calls == 1:
            await release.wait()
        else:
            await asyncio.Event().wait()
        return None

    fixed_now = datetime(2026, 7, 16, 12, 30, tzinfo=UTC)
    rules = make_rules().model_copy(update={"decision_timeout_seconds": 1})
    actor = MatchActor(
        MatchCoordinator((1, 2), rules),
        decision_timeout_seconds=rules.decision_timeout_seconds,
        clock=lambda: fixed_now,
        sleeper=sleeper,
    )
    initial = await actor.start()

    assert initial.action_deadline_at == datetime(2026, 7, 16, 12, 30, 1, tzinfo=UTC)
    release.set()
    for _ in range(10):
        await asyncio.sleep(0)
        if actor.state_version == 1:
            break

    current = actor.current_snapshot()
    assert actor.state_version == 1
    assert current.public.actor_account_id == 2
    assert current.action_deadline_at == initial.action_deadline_at
    await actor.close()


@pytest.mark.asyncio
async def test_unlimited_action_time_does_not_create_a_deadline() -> None:
    actor = MatchActor(MatchCoordinator((1, 2), make_rules()))

    initial = await actor.start()

    assert initial.action_deadline_at is None
    await actor.close()


@pytest.mark.asyncio
async def test_disconnected_current_actor_gets_a_cancellable_fallback() -> None:
    release = asyncio.Event()
    sleeper_calls = 0

    async def sleeper(seconds: float) -> object:
        nonlocal sleeper_calls
        assert seconds == 1
        sleeper_calls += 1
        await release.wait()
        return None

    fixed_now = datetime(2026, 7, 16, 12, 30, tzinfo=UTC)
    actor = MatchActor(
        MatchCoordinator((1, 2), make_rules()),
        disconnect_timeout_seconds=1,
        clock=lambda: fixed_now,
        sleeper=sleeper,
    )
    initial = await actor.start()

    assert actor.schedule_disconnect_timeout(1) is True
    assert initial.action_deadline_at is None
    assert actor.current_snapshot().action_deadline_at == datetime(
        2026, 7, 16, 12, 30, 1, tzinfo=UTC
    )
    actor.cancel_disconnect_timeout(1)
    assert actor.current_snapshot().action_deadline_at is None
    assert sleeper_calls == 0

    assert actor.schedule_disconnect_timeout(1) is True
    await asyncio.sleep(0)
    assert sleeper_calls == 1
    release.set()
    for _ in range(10):
        await asyncio.sleep(0)
        if actor.state_version == 1:
            break

    assert actor.state_version == 1
    assert actor.current_snapshot().public.actor_account_id == 2
    await actor.close()
