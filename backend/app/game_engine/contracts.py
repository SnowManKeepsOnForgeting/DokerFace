"""Stable domain types exposed by the poker engine boundary."""

from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol


class ActionType(StrEnum):
    FOLD = "fold"
    CHECK_OR_CALL = "check_or_call"
    BET_OR_RAISE = "bet_or_raise"
    SHOW = "show"
    MUCK = "muck"


@dataclass(frozen=True)
class HandConfig:
    ante: int
    small_blind: int
    big_blind: int
    allow_showdown_choice: bool = False

    def __post_init__(self) -> None:
        if self.ante < 0:
            raise ValueError("Ante cannot be negative")
        if self.small_blind < 1:
            raise ValueError("Small blind must be positive")
        if self.big_blind < self.small_blind:
            raise ValueError("Big blind cannot be smaller than small blind")


@dataclass(frozen=True)
class LegalAction:
    action: ActionType
    min_amount: int | None = None
    max_amount: int | None = None


@dataclass(frozen=True)
class ActionCommand:
    account_id: int
    action: ActionType
    amount: int | None = None


@dataclass(frozen=True)
class AppliedAction:
    account_id: int
    action: ActionType
    amount: int | None


@dataclass(frozen=True)
class PublicHandSnapshot:
    account_ids: tuple[int, ...]
    stacks: tuple[int, ...]
    bets: tuple[int, ...]
    board: tuple[str, ...]
    folded: tuple[bool, ...]
    all_in: tuple[bool, ...]
    pot_amounts: tuple[int, ...]
    actor_account_id: int | None
    street: str
    complete: bool
    state_version: int = 0


@dataclass(frozen=True)
class PrivateHandSnapshot:
    public: PublicHandSnapshot
    account_id: int
    hole_cards: tuple[str, ...]
    legal_actions: tuple[LegalAction, ...] = ()


@dataclass(frozen=True)
class PotSettlement:
    amount: int
    eligible_indices: tuple[int, ...]
    payouts: tuple[int, ...]


@dataclass(frozen=True)
class HandSettlement:
    final_stacks: tuple[int, ...]
    payoffs: tuple[int, ...]
    contributions: tuple[int, ...] = ()
    pots: tuple[PotSettlement, ...] = ()


class PokerEngineAdapter(Protocol):
    def legal_actions(self, account_id: int) -> tuple[LegalAction, ...]: ...

    def apply_action(self, command: ActionCommand) -> AppliedAction: ...

    def public_snapshot(self) -> PublicHandSnapshot: ...

    def private_snapshot(self, account_id: int) -> PrivateHandSnapshot: ...

    def is_complete(self) -> bool: ...

    def settlement(self) -> HandSettlement: ...


__all__ = [
    "ActionCommand",
    "ActionType",
    "AppliedAction",
    "HandConfig",
    "HandSettlement",
    "LegalAction",
    "PokerEngineAdapter",
    "PotSettlement",
    "PrivateHandSnapshot",
    "PublicHandSnapshot",
]
