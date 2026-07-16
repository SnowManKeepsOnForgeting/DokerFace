from dataclasses import replace
from uuid import uuid4

import pytest

from app.game_engine.contracts import ActionType
from app.statistics.reducer import (
    STATISTICS_REDUCER_VERSION,
    MatchResult,
    StatisticsAction,
    StatisticsHand,
    StatisticsMatch,
    StatisticsPlayer,
    rebuild_statistics,
    reduce_hand,
    reduce_match,
)


def make_hand() -> StatisticsHand:
    match_id = uuid4()
    return StatisticsHand(
        hand_id=uuid4(),
        match_id=match_id,
        pot_amount=300,
        players=(
            StatisticsPlayer(1, "button", False, False, 300, True),
            StatisticsPlayer(2, "big_blind", True, False, 0),
            StatisticsPlayer(3, "small_blind", False, True, 0),
        ),
        actions=(
            StatisticsAction(1, "preflop", ActionType.BET_OR_RAISE, 200),
            StatisticsAction(2, "preflop", ActionType.FOLD),
            StatisticsAction(3, "preflop", ActionType.BET_OR_RAISE, 300),
            StatisticsAction(3, "flop", ActionType.FOLD),
        ),
        reached_showdown=True,
    )


def test_reducer_calculates_opportunities_rates_and_positions() -> None:
    result = reduce_hand(make_hand())

    assert STATISTICS_REDUCER_VERSION == 1
    assert result[1].vpip_opportunities == 1
    assert result[1].vpip == 1
    assert result[1].pfr == 1
    assert result[1].three_bet_opportunities == 0
    assert result[1].showdowns == 1
    assert result[1].showdown_wins == 1
    assert result[1].vpip_rate == 1.0
    assert result[1].average_pot == 300.0
    assert result[1].position_counts == {"button": 1}
    assert result[2].folds == 1
    assert result[2].showdowns == 0
    assert result[3].three_bet_opportunities == 1
    assert result[3].three_bets == 1
    assert result[3].all_ins == 1


def test_reducer_returns_insufficient_data_for_zero_denominators() -> None:
    result = reduce_hand(make_hand())[2]

    assert result.showdown_win_rate is None
    assert result.fold_rate == 1.0


def test_rebuild_is_deterministic_and_counts_profitable_matches() -> None:
    hand = make_hand()
    match = StatisticsMatch(
        match_id=hand.match_id,
        hands=(hand,),
        results={1: MatchResult.PROFIT, 2: MatchResult.LOSS, 3: MatchResult.TIE},
    )

    first = rebuild_statistics((match,))
    second = rebuild_statistics((match,))

    assert first == second
    assert first[1].matches_played == 1
    assert first[1].profitable_matches == 1


def test_reducer_rejects_unknown_action_players_and_cross_match_hands() -> None:
    hand = make_hand()
    invalid_action = replace(
        hand,
        actions=(StatisticsAction(99, "preflop", ActionType.FOLD),),
    )
    with pytest.raises(ValueError, match="unknown player"):
        reduce_hand(invalid_action)

    match = StatisticsMatch(uuid4(), (hand,), {})
    with pytest.raises(ValueError, match="another match"):
        reduce_match(match)
