import pytest
from pydantic import ValidationError

from app.rooms.config import MatchEndMode, RoomRules


def valid_rules(**overrides: object) -> dict[str, object]:
    rules: dict[str, object] = {
        "max_players": 8,
        "end_mode": MatchEndMode.WINNER_TAKES_ALL,
        "starting_chips": 1000,
        "small_blind": 50,
        "big_blind": 100,
        "ante": 0,
        "decision_timeout_seconds": 30,
        "blind_increase_every_hands": 10,
        "show_remaining_board": False,
        "winner_may_show_hand": True,
        "spectators_allowed": False,
        "auto_start": False,
        "counted_in_stats": True,
        "allow_mid_match_join": False,
        "allow_rebuys": False,
        "allow_voluntary_leave": False,
    }
    rules.update(overrides)
    return rules


def test_winner_takes_all_rules_are_valid() -> None:
    rules = RoomRules.model_validate(valid_rules())

    assert rules.end_mode is MatchEndMode.WINNER_TAKES_ALL
    assert rules.fixed_hand_count is None
    assert rules.model_dump(mode="json")["end_mode"] == "winner_takes_all"


def test_fixed_hand_rules_require_and_preserve_hand_count() -> None:
    rules = RoomRules.model_validate(
        valid_rules(end_mode=MatchEndMode.FIXED_HANDS, fixed_hand_count=5)
    )

    assert rules.fixed_hand_count == 5


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("max_players", 1),
        ("max_players", 9),
        ("starting_chips", 99),
        ("small_blind", 0),
        ("big_blind", 0),
        ("ante", -1),
        ("decision_timeout_seconds", 0),
        ("blind_increase_every_hands", 1),
        ("blind_increase_every_hands", 21),
    ],
)
def test_explicit_numeric_limits_are_enforced(field: str, value: int) -> None:
    with pytest.raises(ValidationError):
        RoomRules.model_validate(valid_rules(**{field: value}))


@pytest.mark.parametrize(
    "overrides",
    [
        {"end_mode": MatchEndMode.FIXED_HANDS},
        {"end_mode": MatchEndMode.WINNER_TAKES_ALL, "fixed_hand_count": 5},
        {"small_blind": 101},
    ],
)
def test_cross_field_rules_are_enforced(overrides: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        RoomRules.model_validate(valid_rules(**overrides))


def test_unlimited_decision_time_is_represented_by_none() -> None:
    rules = RoomRules.model_validate(valid_rules(decision_timeout_seconds=None))

    assert rules.decision_timeout_seconds is None
