"""Pure multiplayer Elo calculation."""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite


@dataclass(frozen=True)
class RatingParticipant:
    account_id: int
    rating: float
    finishing_rank: int


@dataclass(frozen=True)
class RatingChange:
    account_id: int
    before_rating: float
    delta: float
    after_rating: float


def calculate_ratings(
    participants: tuple[RatingParticipant, ...],
    k_factor: float = 40.0,
) -> tuple[RatingChange, ...]:
    if len(participants) < 2:
        raise ValueError("A rating calculation requires at least two participants")
    if len({participant.account_id for participant in participants}) != len(participants):
        raise ValueError("Rating participants must be unique")
    if not isfinite(k_factor) or k_factor <= 0:
        raise ValueError("Rating k-factor must be positive and finite")
    if any(
        not isfinite(participant.rating) or participant.finishing_rank < 1
        for participant in participants
    ):
        raise ValueError("Ratings must be finite and ranks must be positive")

    divisor = len(participants) - 1
    changes: list[RatingChange] = []
    for participant in participants:
        score_difference = 0.0
        for opponent in participants:
            if opponent.account_id == participant.account_id:
                continue
            expected = _expected_score(participant.rating, opponent.rating)
            actual = _actual_score(participant.finishing_rank, opponent.finishing_rank)
            score_difference += actual - expected
        delta = k_factor / divisor * score_difference
        changes.append(
            RatingChange(
                account_id=participant.account_id,
                before_rating=participant.rating,
                delta=delta,
                after_rating=participant.rating + delta,
            )
        )
    return tuple(changes)


def _expected_score(rating: float, opponent_rating: float) -> float:
    return 1.0 / (1.0 + 10.0 ** ((opponent_rating - rating) / 400.0))


def _actual_score(rank: int, opponent_rank: int) -> float:
    if rank < opponent_rank:
        return 1.0
    if rank == opponent_rank:
        return 0.5
    return 0.0


__all__ = ["RatingChange", "RatingParticipant", "calculate_ratings"]
