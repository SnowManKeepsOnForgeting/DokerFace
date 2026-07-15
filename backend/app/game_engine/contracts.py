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
    stacks: tuple[int, ...]
    bets: tuple[int, ...]
    board: tuple[str, ...]
    folded: tuple[bool, ...]
    actor_account_id: int | None
    complete: bool
    state_version: int = 0


@dataclass(frozen=True)
class PrivateHandSnapshot:
    public: PublicHandSnapshot
    account_id: int
    hole_cards: tuple[str, ...]


@dataclass(frozen=True)
class HandSettlement:
    final_stacks: tuple[int, ...]
    payoffs: tuple[int, ...]


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
    "PrivateHandSnapshot",
    "PublicHandSnapshot",
]
