import pytest

from app.game_engine.contracts import ActionCommand, ActionType, HandConfig
from app.game_engine.pokerkit_adapter import (
    InvalidActionError,
    NotCurrentActorError,
    PokerKitAdapter,
)

CONFIG = HandConfig(ante=0, small_blind=50, big_blind=100)


def make_heads_up() -> PokerKitAdapter:
    return PokerKitAdapter.create_hand(
        CONFIG,
        account_ids=(101, 202),
        starting_stacks=(1000, 1000),
        button_account_id=101,
    )


def test_heads_up_button_posts_small_blind_and_acts_first_preflop() -> None:
    adapter = make_heads_up()
    snapshot = adapter.public_snapshot()

    assert snapshot.bets == (50, 100)
    assert snapshot.stacks == (950, 900)
    assert snapshot.actor_account_id == 101
    assert {action.action for action in adapter.legal_actions(101)} == {
        ActionType.FOLD,
        ActionType.CHECK_OR_CALL,
        ActionType.BET_OR_RAISE,
    }


def test_fold_completes_hand_and_preserves_chip_conservation() -> None:
    adapter = make_heads_up()

    result = adapter.apply_action(ActionCommand(101, ActionType.FOLD))
    settlement = adapter.settlement()

    assert result.action is ActionType.FOLD
    assert adapter.is_complete()
    assert sum(settlement.final_stacks) == 2000
    assert settlement.final_stacks == (950, 1050)


def test_non_actor_cannot_submit_action() -> None:
    adapter = make_heads_up()

    with pytest.raises(NotCurrentActorError):
        adapter.apply_action(ActionCommand(202, ActionType.FOLD))


def test_check_or_call_amount_is_state_authoritative() -> None:
    adapter = make_heads_up()

    with pytest.raises(InvalidActionError):
        adapter.apply_action(ActionCommand(101, ActionType.CHECK_OR_CALL, amount=1))

    applied = adapter.apply_action(ActionCommand(101, ActionType.CHECK_OR_CALL, amount=50))
    assert applied.amount == 50
