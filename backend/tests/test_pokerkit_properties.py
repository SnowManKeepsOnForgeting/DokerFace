from hypothesis import given
from hypothesis import strategies as st

from app.game_engine.contracts import HandConfig
from app.game_engine.pokerkit_adapter import PokerKitAdapter


@st.composite
def seating_cases(draw: st.DrawFn) -> tuple[tuple[int, ...], int]:
    player_count = draw(st.integers(min_value=2, max_value=8))
    button_index = draw(st.integers(min_value=0, max_value=player_count - 1))
    account_ids = tuple(range(100, 100 + player_count))
    return account_ids, button_index


@given(seating_cases())
def test_initial_blinds_preserve_chips_for_all_supported_player_counts(
    case: tuple[tuple[int, ...], int],
) -> None:
    account_ids, button_index = case
    adapter = PokerKitAdapter.create_hand(
        HandConfig(ante=0, small_blind=50, big_blind=100),
        account_ids=account_ids,
        starting_stacks=(1000,) * len(account_ids),
        button_account_id=account_ids[button_index],
    )
    snapshot = adapter.public_snapshot()

    assert sum(snapshot.stacks) + sum(snapshot.bets) == 1000 * len(account_ids)
    assert sum(snapshot.bets) == 150
    assert snapshot.actor_account_id in account_ids
