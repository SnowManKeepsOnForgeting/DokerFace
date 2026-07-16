# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false

"""PokerKit implementation behind the project-owned engine contract."""

import warnings
from collections import deque
from typing import Any, cast

from pokerkit import Automation, Card, Mode, NoLimitTexasHoldem

from app.game_engine.contracts import (
    ActionCommand,
    ActionType,
    AppliedAction,
    HandConfig,
    HandSettlement,
    LegalAction,
    PrivateHandSnapshot,
    PublicHandSnapshot,
)


class UnknownPlayerError(ValueError):
    """Raised when an account is not seated in the hand."""


class NotCurrentActorError(ValueError):
    """Raised when a player acts out of turn."""


class InvalidActionError(ValueError):
    """Raised when an action does not match the adapter contract."""


_AUTOMATIONS = (
    Automation.ANTE_POSTING,
    Automation.BET_COLLECTION,
    Automation.BLIND_OR_STRADDLE_POSTING,
    Automation.CARD_BURNING,
    Automation.HOLE_DEALING,
    Automation.BOARD_DEALING,
    Automation.RUNOUT_COUNT_SELECTION,
    Automation.HOLE_CARDS_SHOWING_OR_MUCKING,
    Automation.HAND_KILLING,
    Automation.CHIPS_PUSHING,
    Automation.CHIPS_PULLING,
)
_MANUAL_DEALING_AUTOMATIONS = tuple(
    automation
    for automation in _AUTOMATIONS
    if automation
    not in {
        Automation.CARD_BURNING,
        Automation.HOLE_DEALING,
        Automation.BOARD_DEALING,
    }
)


class PokerKitAdapter:
    def __init__(
        self,
        state: Any,
        account_ids: tuple[int, ...],
        starting_stacks: tuple[int, ...],
        manual_dealing: bool,
    ) -> None:
        self._state = state
        self._account_ids = account_ids
        self._account_to_index = {account_id: index for index, account_id in enumerate(account_ids)}
        self._starting_stacks = starting_stacks
        self._manual_dealing = manual_dealing

    @classmethod
    def create_hand(
        cls,
        config: HandConfig,
        account_ids: tuple[int, ...],
        starting_stacks: tuple[int, ...],
        button_account_id: int,
        fixed_deck: str | None = None,
    ) -> "PokerKitAdapter":
        if len(account_ids) < 2 or len(account_ids) > 8:
            raise ValueError("A hand requires between 2 and 8 players")
        if len(account_ids) != len(starting_stacks):
            raise ValueError("Account and stack counts must match")
        if any(stack < 1 for stack in starting_stacks):
            raise ValueError("Starting stacks must be positive")
        if len(set(account_ids)) != len(account_ids):
            raise ValueError("Account IDs must be unique")
        try:
            button_index = account_ids.index(button_account_id)
        except ValueError as error:
            raise UnknownPlayerError("Button account is not seated") from error

        raw_blinds = cls._raw_blinds(
            len(account_ids),
            button_index,
            config.small_blind,
            config.big_blind,
        )
        automations = _MANUAL_DEALING_AUTOMATIONS if fixed_deck is not None else _AUTOMATIONS
        if config.allow_showdown_choice:
            automations = tuple(
                automation
                for automation in automations
                if automation is not Automation.HOLE_CARDS_SHOWING_OR_MUCKING
            )
        state = NoLimitTexasHoldem.create_state(
            automations,
            False,
            config.ante,
            raw_blinds,
            config.big_blind,
            starting_stacks,
            len(account_ids),
            mode=Mode.CASH_GAME,
        )
        if fixed_deck is not None:
            state.deck_cards = deque(Card.parse(fixed_deck))
        return cls(state, account_ids, starting_stacks, fixed_deck is not None)

    @staticmethod
    def _raw_blinds(
        player_count: int,
        button_index: int,
        small_blind: int,
        big_blind: int,
    ) -> tuple[int, ...]:
        if player_count == 2:
            return tuple(
                big_blind if index == button_index else small_blind for index in range(player_count)
            )

        blinds = [0] * player_count
        blinds[(button_index + 1) % player_count] = small_blind
        blinds[(button_index + 2) % player_count] = big_blind
        return tuple(blinds)

    def legal_actions(self, account_id: int) -> tuple[LegalAction, ...]:
        player_index = self._player_index(account_id)
        if self._state.showdown_index == player_index:
            return (LegalAction(ActionType.SHOW), LegalAction(ActionType.MUCK))
        self._require_current_actor(player_index)
        actions: list[LegalAction] = []
        with warnings.catch_warnings():
            warnings.simplefilter("error", UserWarning)
            can_fold = self._state.can_fold()
        if can_fold:
            actions.append(LegalAction(ActionType.FOLD))
        if self._state.can_check_or_call():
            amount = self._state.checking_or_calling_amount
            actions.append(LegalAction(ActionType.CHECK_OR_CALL, amount, amount))
        if self._state.can_complete_bet_or_raise_to():
            actions.append(
                LegalAction(
                    ActionType.BET_OR_RAISE,
                    self._state.min_completion_betting_or_raising_to_amount,
                    self._state.max_completion_betting_or_raising_to_amount,
                )
            )
        return tuple(actions)

    def private_snapshot(self, account_id: int) -> PrivateHandSnapshot:
        player_index = self._player_index(account_id)
        legal_actions: tuple[LegalAction, ...] = ()
        if self._state.actor_index == player_index or self._state.showdown_index == player_index:
            legal_actions = self.legal_actions(account_id)
        return PrivateHandSnapshot(
            public=self.public_snapshot(),
            account_id=account_id,
            hole_cards=tuple(
                self._card_code(card) for card in self._state.hole_cards[player_index]
            ),
            legal_actions=legal_actions,
        )

    def deal_hole(self, cards: str) -> None:
        if not self._manual_dealing:
            raise InvalidActionError("Manual dealing is only available for fixed-deck tests")
        self._state.deal_hole(cards)

    def burn_card(self, card: str) -> None:
        if not self._manual_dealing:
            raise InvalidActionError("Manual dealing is only available for fixed-deck tests")
        self._state.burn_card(card)

    def deal_board(self, cards: str) -> None:
        if not self._manual_dealing:
            raise InvalidActionError("Manual dealing is only available for fixed-deck tests")
        self._state.deal_board(cards)

    def apply_action(self, command: ActionCommand) -> AppliedAction:
        player_index = self._player_index(command.account_id)
        if command.action in {ActionType.SHOW, ActionType.MUCK}:
            if player_index != self._state.showdown_index or command.amount is not None:
                raise InvalidActionError("Show or muck is not legal for this account")
            status = command.action is ActionType.SHOW
            if not self._state.can_show_or_muck_hole_cards(status):
                raise InvalidActionError("Show or muck is not legal in the current state")
            self._state.show_or_muck_hole_cards(status)
            return AppliedAction(command.account_id, command.action, None)
        self._require_current_actor(player_index)
        if command.action is ActionType.FOLD:
            if command.amount is not None:
                raise InvalidActionError("Fold cannot include an amount")
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", UserWarning)
                self._state.fold()
            return AppliedAction(command.account_id, command.action, None)
        if command.action is ActionType.CHECK_OR_CALL:
            expected_amount = self._state.checking_or_calling_amount
            if expected_amount is None:
                raise InvalidActionError("Check or call is not legal")
            if command.amount is not None and command.amount != expected_amount:
                raise InvalidActionError("Check or call amount does not match state")
            self._state.check_or_call()
            return AppliedAction(command.account_id, command.action, expected_amount)
        if command.action is ActionType.BET_OR_RAISE:
            if command.amount is None or not self._state.can_complete_bet_or_raise_to(
                command.amount
            ):
                raise InvalidActionError("Bet or raise amount is not legal")
            self._state.complete_bet_or_raise_to(command.amount)
            return AppliedAction(command.account_id, command.action, command.amount)
        raise InvalidActionError(f"Unsupported action {command.action}")

    def public_snapshot(self) -> PublicHandSnapshot:
        actor_index = cast(int | None, self._state.turn_index)
        actor_account_id = self._account_ids[actor_index] if actor_index is not None else None
        street: str
        if self._state.showdown_index is not None:
            street = "showdown"
        elif not self._state.status:
            street = "settlement"
        else:
            street = ("preflop", "flop", "turn", "river")[cast(int, self._state.street_index)]
        pot_amounts = tuple(self._state.pot_amounts)
        if not pot_amounts:
            pot_amounts = (cast(int, self._state.total_pot_amount),)
        return PublicHandSnapshot(
            account_ids=self._account_ids,
            stacks=tuple(self._state.stacks),
            bets=tuple(self._state.bets),
            board=tuple(self._card_code(card) for card in self._state.get_board_cards(0)),
            folded=tuple(not status for status in self._state.statuses),
            all_in=tuple(
                stack == 0 and status
                for stack, status in zip(self._state.stacks, self._state.statuses, strict=True)
            ),
            pot_amounts=pot_amounts,
            actor_account_id=actor_account_id,
            street=street,
            complete=not self._state.status,
        )

    def is_complete(self) -> bool:
        return not self._state.status

    def settlement(self) -> HandSettlement:
        if not self.is_complete():
            raise ValueError("Hand is not complete")
        return HandSettlement(
            final_stacks=tuple(self._state.stacks),
            payoffs=tuple(self._state.payoffs),
        )

    def _player_index(self, account_id: int) -> int:
        try:
            return self._account_to_index[account_id]
        except KeyError as error:
            raise UnknownPlayerError("Account is not seated") from error

    @staticmethod
    def _card_code(card: Any) -> str:
        card_text = str(card)
        return card_text.rsplit("(", 1)[-1].removesuffix(")")

    def _require_current_actor(self, player_index: int) -> None:
        if self._state.actor_index != player_index:
            raise NotCurrentActorError("Account is not the current actor")


__all__ = [
    "InvalidActionError",
    "NotCurrentActorError",
    "PokerKitAdapter",
    "UnknownPlayerError",
]
