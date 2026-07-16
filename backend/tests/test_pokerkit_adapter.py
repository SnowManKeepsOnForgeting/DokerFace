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


def test_snapshots_expose_public_state_and_private_legal_actions() -> None:
    adapter = make_heads_up()

    public = adapter.public_snapshot()
    private = adapter.private_snapshot(101)

    assert public.account_ids == (101, 202)
    assert public.pot_amounts == (150,)
    assert public.street == "preflop"
    assert public.all_in == (False, False)
    assert {action.action for action in private.legal_actions} == {
        ActionType.FOLD,
        ActionType.CHECK_OR_CALL,
        ActionType.BET_OR_RAISE,
    }
    assert adapter.private_snapshot(202).legal_actions == ()


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
        call_actions = [
            action
            for action in adapter.legal_actions(actor_account_id)
            if action.action is ActionType.CHECK_OR_CALL
        ]
        if not call_actions:
            return
        call_action = call_actions[0]
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


def test_odd_split_pot_chip_is_awarded_to_one_tied_winner() -> None:
    adapter = PokerKitAdapter.create_hand(
        HandConfig(ante=1, small_blind=50, big_blind=100),
        account_ids=(101, 202, 303),
        starting_stacks=(1000, 1000, 1000),
        button_account_id=101,
        fixed_deck="2c3d4c5d6c7dAsKdQcJhTs9c8d7h6s",
    )
    adapter.deal_hole("2c3d")
    adapter.deal_hole("4c5d")
    adapter.deal_hole("6c7d")
    while not adapter.public_snapshot().complete:
        actor_account_id = adapter.public_snapshot().actor_account_id
        assert actor_account_id is not None
        if actor_account_id == 303:
            adapter.apply_action(ActionCommand(303, ActionType.FOLD))
            break
        call_action = next(
            action
            for action in adapter.legal_actions(actor_account_id)
            if action.action is ActionType.CHECK_OR_CALL
        )
        adapter.apply_action(
            ActionCommand(actor_account_id, ActionType.CHECK_OR_CALL, call_action.min_amount)
        )
    deal_street(adapter, "9c", "AsKdQc")
    check_until_dealing(adapter)
    deal_street(adapter, "8d", "Jh")
    check_until_dealing(adapter)
    deal_street(adapter, "7h", "Ts")
    check_until_dealing(adapter)

    settlement = adapter.settlement()
    assert sorted(settlement.final_stacks) == [899, 1050, 1051]


def test_showdown_choice_exposes_only_explicitly_shown_cards() -> None:
    adapter = PokerKitAdapter.create_hand(
        HandConfig(ante=0, small_blind=50, big_blind=100, allow_showdown_choice=True),
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

    first_showdown_account = adapter.public_snapshot().actor_account_id
    assert first_showdown_account is not None
    assert {action.action for action in adapter.legal_actions(first_showdown_account)} == {
        ActionType.SHOW,
        ActionType.MUCK,
    }
    adapter.apply_action(ActionCommand(first_showdown_account, ActionType.SHOW))
    second_showdown_account = adapter.public_snapshot().actor_account_id
    assert second_showdown_account is not None
    adapter.apply_action(ActionCommand(second_showdown_account, ActionType.MUCK))

    assert adapter.is_complete()
    assert adapter.private_snapshot(first_showdown_account).hole_cards == ("2c", "3d")
    assert not hasattr(adapter.public_snapshot(), "hole_cards")
