"""Versioned, database-independent statistics reducer."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field, replace
from enum import StrEnum
from uuid import UUID

from app.game_engine.contracts import ActionType

STATISTICS_REDUCER_VERSION = 1


def _empty_position_counts() -> dict[str, int]:
    return {}


class MatchResult(StrEnum):
    PROFIT = "profit"
    LOSS = "loss"
    TIE = "tie"


@dataclass(frozen=True)
class StatisticsAction:
    account_id: int
    street: str
    action: ActionType
    amount: int | None = None


@dataclass(frozen=True)
class StatisticsPlayer:
    account_id: int
    position: str
    folded: bool
    all_in: bool
    won_chips: int
    showdown: bool = False


@dataclass(frozen=True)
class StatisticsHand:
    hand_id: UUID
    match_id: UUID
    pot_amount: int
    players: tuple[StatisticsPlayer, ...]
    actions: tuple[StatisticsAction, ...]
    reached_showdown: bool


@dataclass(frozen=True)
class StatisticsMatch:
    match_id: UUID
    hands: tuple[StatisticsHand, ...]
    results: dict[int, MatchResult]


@dataclass(frozen=True)
class PlayerStatistics:
    account_id: int
    dealt_hands: int = 0
    won_hands: int = 0
    matches_played: int = 0
    profitable_matches: int = 0
    vpip_opportunities: int = 0
    vpip: int = 0
    pfr_opportunities: int = 0
    pfr: int = 0
    three_bet_opportunities: int = 0
    three_bets: int = 0
    showdown_opportunities: int = 0
    showdowns: int = 0
    showdown_wins: int = 0
    decisions: int = 0
    folds: int = 0
    all_ins: int = 0
    pot_total: int = 0
    pot_count: int = 0
    position_counts: dict[str, int] = field(default_factory=_empty_position_counts)

    @property
    def vpip_rate(self) -> float | None:
        return _ratio(self.vpip, self.vpip_opportunities)

    @property
    def pfr_rate(self) -> float | None:
        return _ratio(self.pfr, self.pfr_opportunities)

    @property
    def three_bet_rate(self) -> float | None:
        return _ratio(self.three_bets, self.three_bet_opportunities)

    @property
    def showdown_rate(self) -> float | None:
        return _ratio(self.showdowns, self.showdown_opportunities)

    @property
    def showdown_win_rate(self) -> float | None:
        return _ratio(self.showdown_wins, self.showdowns)

    @property
    def fold_rate(self) -> float | None:
        return _ratio(self.folds, self.decisions)

    @property
    def average_pot(self) -> float | None:
        return _ratio(self.pot_total, self.pot_count)


def reduce_hand(hand: StatisticsHand) -> dict[int, PlayerStatistics]:
    player_ids = {player.account_id for player in hand.players}
    if len(player_ids) != len(hand.players):
        raise ValueError("Hand players must be unique")
    if any(action.account_id not in player_ids for action in hand.actions):
        raise ValueError("Hand action contains an unknown player")

    actions_by_player: dict[int, list[StatisticsAction]] = {
        account_id: [] for account_id in player_ids
    }
    preflop_opportunities: set[int] = set()
    preflop_raises_seen = False
    three_bet_opportunities: set[int] = set()
    three_bets: set[int] = set()

    for action in hand.actions:
        actions_by_player[action.account_id].append(action)
        if action.street != "preflop" or action.action in {ActionType.SHOW, ActionType.MUCK}:
            continue
        preflop_opportunities.add(action.account_id)
        if preflop_raises_seen and action.account_id not in three_bet_opportunities:
            three_bet_opportunities.add(action.account_id)
            if action.action is ActionType.BET_OR_RAISE:
                three_bets.add(action.account_id)
        if action.action is ActionType.BET_OR_RAISE:
            preflop_raises_seen = True

    deltas: dict[int, PlayerStatistics] = {}
    for player in hand.players:
        player_actions = actions_by_player[player.account_id]
        preflop_actions = [action for action in player_actions if action.street == "preflop"]
        raises = {action.action for action in preflop_actions}
        folds = sum(action.action is ActionType.FOLD for action in player_actions)
        decisions = sum(
            action.action not in {ActionType.SHOW, ActionType.MUCK} for action in player_actions
        )
        vpip = any(
            action.action is ActionType.BET_OR_RAISE
            or (
                action.action is ActionType.CHECK_OR_CALL
                and action.amount is not None
                and action.amount > 0
            )
            for action in preflop_actions
        )
        reached_showdown = hand.reached_showdown and not player.folded
        deltas[player.account_id] = PlayerStatistics(
            account_id=player.account_id,
            dealt_hands=1,
            won_hands=int(player.won_chips > 0),
            vpip_opportunities=int(player.account_id in preflop_opportunities),
            vpip=int(vpip),
            pfr_opportunities=int(player.account_id in preflop_opportunities),
            pfr=int(ActionType.BET_OR_RAISE in raises),
            three_bet_opportunities=int(player.account_id in three_bet_opportunities),
            three_bets=int(player.account_id in three_bets),
            showdown_opportunities=int(not player.folded),
            showdowns=int(reached_showdown),
            showdown_wins=int(reached_showdown and player.showdown and player.won_chips > 0),
            decisions=decisions,
            folds=folds,
            all_ins=int(player.all_in),
            pot_total=hand.pot_amount,
            pot_count=1,
            position_counts={player.position: 1},
        )
    return deltas


def reduce_match(match: StatisticsMatch) -> dict[int, PlayerStatistics]:
    totals: dict[int, PlayerStatistics] = {}
    for hand in match.hands:
        if hand.match_id != match.match_id:
            raise ValueError("Hand belongs to another match")
        for account_id, delta in reduce_hand(hand).items():
            totals[account_id] = _merge(totals.get(account_id), delta)

    for account_id, result in match.results.items():
        current = totals.get(account_id, PlayerStatistics(account_id=account_id))
        totals[account_id] = replace(
            current,
            matches_played=current.matches_played + 1,
            profitable_matches=current.profitable_matches + int(result is MatchResult.PROFIT),
        )
    return totals


def rebuild_statistics(matches: Iterable[StatisticsMatch]) -> dict[int, PlayerStatistics]:
    totals: dict[int, PlayerStatistics] = {}
    for match in matches:
        for account_id, delta in reduce_match(match).items():
            totals[account_id] = _merge(totals.get(account_id), delta)
    return totals


def _merge(existing: PlayerStatistics | None, delta: PlayerStatistics) -> PlayerStatistics:
    if existing is None:
        return delta
    positions = existing.position_counts.copy()
    for position, count in delta.position_counts.items():
        positions[position] = positions.get(position, 0) + count
    return replace(
        existing,
        dealt_hands=existing.dealt_hands + delta.dealt_hands,
        won_hands=existing.won_hands + delta.won_hands,
        matches_played=existing.matches_played + delta.matches_played,
        profitable_matches=existing.profitable_matches + delta.profitable_matches,
        vpip_opportunities=existing.vpip_opportunities + delta.vpip_opportunities,
        vpip=existing.vpip + delta.vpip,
        pfr_opportunities=existing.pfr_opportunities + delta.pfr_opportunities,
        pfr=existing.pfr + delta.pfr,
        three_bet_opportunities=existing.three_bet_opportunities + delta.three_bet_opportunities,
        three_bets=existing.three_bets + delta.three_bets,
        showdown_opportunities=existing.showdown_opportunities + delta.showdown_opportunities,
        showdowns=existing.showdowns + delta.showdowns,
        showdown_wins=existing.showdown_wins + delta.showdown_wins,
        decisions=existing.decisions + delta.decisions,
        folds=existing.folds + delta.folds,
        all_ins=existing.all_ins + delta.all_ins,
        pot_total=existing.pot_total + delta.pot_total,
        pot_count=existing.pot_count + delta.pot_count,
        position_counts=positions,
    )


def _ratio(numerator: int, denominator: int) -> float | None:
    return numerator / denominator if denominator else None


__all__ = [
    "STATISTICS_REDUCER_VERSION",
    "MatchResult",
    "PlayerStatistics",
    "StatisticsAction",
    "StatisticsHand",
    "StatisticsMatch",
    "StatisticsPlayer",
    "rebuild_statistics",
    "reduce_hand",
    "reduce_match",
]
