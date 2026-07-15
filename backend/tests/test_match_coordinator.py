import pytest

from app.game_engine.contracts import ActionCommand, ActionType
from app.game_engine.match import MatchCoordinator, MatchStateError, MatchStatus, blind_amounts
from app.rooms.config import MatchEndMode, RoomRules


def rules(
    end_mode: MatchEndMode = MatchEndMode.WINNER_TAKES_ALL,
    fixed_hand_count: int = 5,
) -> RoomRules:
    return RoomRules.model_validate(
        {
            "max_players": 2,
            "end_mode": end_mode,
            "fixed_hand_count": fixed_hand_count if end_mode is MatchEndMode.FIXED_HANDS else None,
            "starting_chips": 1000,
            "small_blind": 50,
            "big_blind": 100,
            "ante": 0,
            "decision_timeout_seconds": None,
            "blind_increase_every_hands": 2,
            "show_remaining_board": False,
            "winner_may_show_hand": True,
            "spectators_allowed": False,
            "auto_start": False,
            "counted_in_stats": True,
            "allow_mid_match_join": False,
            "allow_rebuys": False,
            "allow_voluntary_leave": False,
        }
    )


def test_blinds_double_from_the_next_frequency_boundary() -> None:
    config = rules()

    assert blind_amounts(config, 1).big_blind == 100
    assert blind_amounts(config, 2).big_blind == 100
    assert blind_amounts(config, 3).big_blind == 200


def test_winner_takes_all_completes_after_one_player_is_busted() -> None:
    coordinator = MatchCoordinator((1, 2), rules())

    for _ in range(20):
        coordinator.start_hand()
        snapshot = coordinator.public_snapshot()
        if snapshot.complete:
            coordinator.settle_hand()
            if coordinator.status is MatchStatus.COMPLETE:
                break
            continue
        actor_account_id = snapshot.actor_account_id
        assert actor_account_id is not None
        coordinator.apply_action(ActionCommand(actor_account_id, ActionType.FOLD))
        coordinator.settle_hand()
        if coordinator.status is MatchStatus.COMPLETE:
            break

    assert coordinator.status is MatchStatus.COMPLETE
    assert sorted(coordinator.stacks.values()) == [0, 2000]


def test_fixed_hand_match_rotates_button_and_completes_after_hand_count() -> None:
    coordinator = MatchCoordinator((1, 2), rules(MatchEndMode.FIXED_HANDS))

    coordinator.start_hand()
    coordinator.apply_action(ActionCommand(1, ActionType.FOLD))
    coordinator.settle_hand()
    assert coordinator.status is MatchStatus.ACTIVE
    assert coordinator.button_account_id == 2

    for _ in range(4):
        coordinator.start_hand()
        actor_account_id = coordinator.public_snapshot().actor_account_id
        assert actor_account_id is not None
        coordinator.apply_action(ActionCommand(actor_account_id, ActionType.FOLD))
        coordinator.settle_hand()

    assert coordinator.status is MatchStatus.COMPLETE
    assert coordinator.hand_number == 5


def test_hand_must_be_settled_before_starting_another() -> None:
    coordinator = MatchCoordinator((1, 2), rules())
    coordinator.start_hand()

    with pytest.raises(MatchStateError):
        coordinator.start_hand()
