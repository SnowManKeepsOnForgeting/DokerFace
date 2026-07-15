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


def test_three_player_button_and_blind_order_are_mapped() -> None:
    adapter = PokerKitAdapter.create_hand(
        CONFIG,
        account_ids=(101, 202, 303),
        starting_stacks=(1000, 1000, 1000),
        button_account_id=101,
    )

    snapshot = adapter.public_snapshot()

    assert snapshot.bets == (0, 50, 100)
    assert snapshot.actor_account_id == 101


def test_minimum_raise_is_enforced_by_adapter() -> None:
    adapter = make_heads_up()

    with pytest.raises(InvalidActionError):
        adapter.apply_action(ActionCommand(101, ActionType.BET_OR_RAISE, amount=199))

    applied = adapter.apply_action(ActionCommand(101, ActionType.BET_OR_RAISE, amount=200))
    assert applied.amount == 200


def test_short_stack_side_pot_flow_conserves_chips_and_limits_short_stack() -> None:
    adapter = PokerKitAdapter.create_hand(
        CONFIG,
        account_ids=(101, 202, 303),
        starting_stacks=(1000, 500, 200),
        button_account_id=101,
    )

    adapter.apply_action(ActionCommand(101, ActionType.BET_OR_RAISE, amount=1000))
    adapter.apply_action(ActionCommand(202, ActionType.CHECK_OR_CALL, amount=450))
    adapter.apply_action(ActionCommand(303, ActionType.CHECK_OR_CALL, amount=100))
    settlement = adapter.settlement()

    assert sum(settlement.final_stacks) == 1700
    assert sum(settlement.payoffs) == 0
    assert settlement.final_stacks[2] <= 600


def check_until_dealing(adapter: PokerKitAdapter) -> None:
    while not adapter.public_snapshot().complete:
        actor_account_id = adapter.public_snapshot().actor_account_id
        if actor_account_id is None:
            return
        call_action = next(
            action
            for action in adapter.legal_actions(actor_account_id)
            if action.action is ActionType.CHECK_OR_CALL
        )
        adapter.apply_action(
            ActionCommand(
                account_id=actor_account_id,
                action=call_action.action,
                amount=call_action.min_amount,
            )
        )


def deal_street(adapter: PokerKitAdapter, burn: str, board: str) -> None:
    adapter.burn_card(burn)
    adapter.deal_board(board)


def test_public_board_can_create_a_deterministic_split_pot() -> None:
    adapter = PokerKitAdapter.create_hand(
        CONFIG,
        account_ids=(101, 202),
        starting_stacks=(1000, 1000),
        button_account_id=101,
        fixed_deck="2c3d4c5dAsKdQcJhTs9c8d7h6s5c4d3h",
    )
    adapter.deal_hole("2c3d")
    adapter.deal_hole("4c5d")
    check_until_dealing(adapter)
    deal_street(adapter, "9c", "AsKdQc")
    check_until_dealing(adapter)
    deal_street(adapter, "8d", "Jh")
    check_until_dealing(adapter)
    deal_street(adapter, "7h", "Ts")
    check_until_dealing(adapter)

    settlement = adapter.settlement()
    assert settlement.final_stacks == (1000, 1000)


def test_fixed_deck_side_pots_award_main_and_side_pots_to_eligible_players() -> None:
    adapter = PokerKitAdapter.create_hand(
        CONFIG,
        account_ids=(101, 202, 303),
        starting_stacks=(1000, 500, 200),
        button_account_id=101,
        fixed_deck="AsAdKcKd2c3c2d2h2s4c7d9c8hTh",
    )
    adapter.deal_hole("AsAd")
    adapter.deal_hole("KcKd")
    adapter.deal_hole("2c3c")
    adapter.apply_action(ActionCommand(101, ActionType.BET_OR_RAISE, amount=1000))
    adapter.apply_action(ActionCommand(202, ActionType.CHECK_OR_CALL, amount=450))
    adapter.apply_action(ActionCommand(303, ActionType.CHECK_OR_CALL, amount=100))
    deal_street(adapter, "9c", "2d2h2s")
    deal_street(adapter, "4c", "7d")
    deal_street(adapter, "8h", "Th")

    settlement = adapter.settlement()
    assert settlement.final_stacks == (1100, 0, 600)
