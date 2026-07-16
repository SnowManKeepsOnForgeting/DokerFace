import pytest

from app.ratings.calculator import RatingParticipant, calculate_ratings


def test_multiplayer_elo_is_zero_sum_for_unique_ranks() -> None:
    changes = calculate_ratings(
        (
            RatingParticipant(1, 1000, 1),
            RatingParticipant(2, 1000, 2),
            RatingParticipant(3, 1000, 3),
            RatingParticipant(4, 1000, 4),
        )
    )

    assert [round(change.delta, 6) for change in changes] == [20.0, 6.666667, -6.666667, -20.0]
    assert abs(sum(change.delta for change in changes)) < 1e-9


def test_tied_players_receive_half_pairwise_results() -> None:
    changes = calculate_ratings(
        (
            RatingParticipant(1, 1000, 1),
            RatingParticipant(2, 1000, 1),
            RatingParticipant(3, 1000, 3),
        )
    )

    assert abs(changes[0].delta - changes[1].delta) < 1e-9
    assert abs(changes[0].delta - 10.0) < 1e-9
    assert abs(sum(change.delta for change in changes)) < 1e-9


@pytest.mark.parametrize(
    "participants",
    [
        (),
        (RatingParticipant(1, 1000, 1),),
        (RatingParticipant(1, 1000, 1), RatingParticipant(1, 1000, 2)),
        (RatingParticipant(1, 1000, 0), RatingParticipant(2, 1000, 1)),
    ],
)
def test_rating_inputs_are_validated(participants: tuple[RatingParticipant, ...]) -> None:
    with pytest.raises(ValueError):
        calculate_ratings(participants)
