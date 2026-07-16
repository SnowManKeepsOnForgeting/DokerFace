"""Pure multi-hand match coordination around the poker engine adapter."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from app.game_engine.contracts import (
    ActionCommand,
    AppliedAction,
    HandSettlement,
    PublicHandSnapshot,
)
from app.game_engine.pokerkit_adapter import PokerKitAdapter
from app.rooms.config import MatchEndMode, RoomRules


class MatchStatus(StrEnum):
    ACTIVE = "active"
    COMPLETE = "complete"


class MatchStateError(ValueError):
    """Raised when a match operation does not fit its lifecycle state."""


@dataclass(frozen=True)
class BlindAmounts:
    small_blind: int
    big_blind: int


def blind_amounts(rules: RoomRules, hand_number: int) -> BlindAmounts:
    if hand_number < 1:
        raise ValueError("Hand number must be positive")
    level = (hand_number - 1) // rules.blind_increase_every_hands
    multiplier = 1 << level
    return BlindAmounts(
        small_blind=rules.small_blind * multiplier,
        big_blind=rules.big_blind * multiplier,
    )


class MatchCoordinator:
    def __init__(
        self,
        player_ids: tuple[int, ...],
        rules: RoomRules,
        button_index: int = 0,
    ) -> None:
        if len(player_ids) < 2 or len(player_ids) > rules.max_players:
            raise ValueError("Player count does not fit room rules")
        if len(set(player_ids)) != len(player_ids):
            raise ValueError("Player IDs must be unique")
        if button_index not in range(len(player_ids)):
            raise ValueError("Button index is outside player seats")
        self._player_ids = player_ids
        self._rules = rules
        self._button_index = button_index
        self._stacks = {account_id: rules.starting_chips for account_id in player_ids}
        self._hand_number = 0
        self._hand: PokerKitAdapter | None = None
        self._hand_player_ids: tuple[int, ...] = ()
        self._hand_blinds: BlindAmounts | None = None
        self._status = MatchStatus.ACTIVE

    @property
    def status(self) -> MatchStatus:
        return self._status

    @property
    def hand_number(self) -> int:
        return self._hand_number

    @property
    def stacks(self) -> dict[int, int]:
        return self._stacks.copy()

    @property
    def player_ids(self) -> tuple[int, ...]:
        return self._player_ids

    @property
    def button_account_id(self) -> int:
        return self._player_ids[self._button_index]

    @property
    def hand(self) -> PokerKitAdapter:
        if self._hand is None:
            raise MatchStateError("No hand is currently active")
        return self._hand

    @property
    def rules(self) -> RoomRules:
        return self._rules

    @property
    def hand_player_ids(self) -> tuple[int, ...]:
        return self._hand_player_ids

    @property
    def hand_blinds(self) -> BlindAmounts:
        if self._hand_blinds is None:
            raise MatchStateError("No current hand blinds")
        return self._hand_blinds

    def start_hand(self) -> PokerKitAdapter:
        if self._status is MatchStatus.COMPLETE:
            raise MatchStateError("Match is complete")
        if self._hand is not None:
            raise MatchStateError("Current hand must be settled first")

        active_ids = tuple(
            account_id for account_id in self._player_ids if self._stacks[account_id] > 0
        )
        if len(active_ids) < 2:
            self._status = MatchStatus.COMPLETE
            raise MatchStateError("Not enough players with chips")
        button_account_id = self._next_active_button(active_ids)
        amounts = blind_amounts(self._rules, self._hand_number + 1)
        self._hand_player_ids = active_ids
        self._hand_blinds = amounts
        self._hand_number += 1
        self._hand = PokerKitAdapter.create_hand(
            self._hand_config(amounts),
            account_ids=active_ids,
            starting_stacks=tuple(self._stacks[account_id] for account_id in active_ids),
            button_account_id=button_account_id,
        )
        return self._hand

    def apply_action(self, command: ActionCommand) -> AppliedAction:
        return self.hand.apply_action(command)

    def public_snapshot(self) -> PublicHandSnapshot:
        return self.hand.public_snapshot()

    def settle_hand(self) -> HandSettlement:
        hand = self.hand
        if not hand.is_complete():
            raise MatchStateError("Hand is not complete")
        settlement = hand.settlement()
        for account_id, stack in zip(self._hand_player_ids, settlement.final_stacks, strict=True):
            self._stacks[account_id] = stack
        self._hand = None
        self._hand_player_ids = ()
        self._hand_blinds = None
        self._button_index = (self._button_index + 1) % len(self._player_ids)
        if self._match_is_complete():
            self._status = MatchStatus.COMPLETE
        return settlement

    def _hand_config(self, amounts: BlindAmounts):
        from app.game_engine.contracts import HandConfig

        return HandConfig(
            ante=self._rules.ante,
            small_blind=amounts.small_blind,
            big_blind=amounts.big_blind,
            allow_showdown_choice=self._rules.winner_may_show_hand,
        )

    def _next_active_button(self, active_ids: tuple[int, ...]) -> int:
        for offset in range(len(self._player_ids)):
            candidate = self._player_ids[(self._button_index + offset) % len(self._player_ids)]
            if candidate in active_ids:
                return candidate
        raise MatchStateError("No active button seat")

    def _match_is_complete(self) -> bool:
        active_count = sum(stack > 0 for stack in self._stacks.values())
        if self._rules.end_mode is MatchEndMode.WINNER_TAKES_ALL:
            return active_count <= 1
        return self._hand_number >= (self._rules.fixed_hand_count or 0)


__all__ = ["BlindAmounts", "MatchCoordinator", "MatchStateError", "MatchStatus", "blind_amounts"]
