"""Validated room rules shared by persistence and HTTP boundaries."""

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, model_validator


class RoomVisibility(StrEnum):
    PUBLIC = "public"
    PASSWORD = "password"
    INVITE = "invite"


class MatchEndMode(StrEnum):
    WINNER_TAKES_ALL = "winner_takes_all"
    FIXED_HANDS = "fixed_hands"


class RoomRules(BaseModel):
    """Rules that are frozen when a match starts."""

    model_config = ConfigDict(extra="forbid")

    max_players: int = Field(ge=2, le=8)
    end_mode: MatchEndMode
    fixed_hand_count: int | None = Field(default=None, ge=5, le=20)
    starting_chips: int = Field(ge=100)
    small_blind: int = Field(ge=1)
    big_blind: int = Field(ge=1)
    ante: int = Field(ge=0)
    decision_timeout_seconds: int | None = Field(default=None, ge=1)
    blind_increase_every_hands: int = Field(ge=2, le=20)
    show_remaining_board: bool
    winner_may_show_hand: bool
    spectators_allowed: bool
    auto_start: bool
    counted_in_stats: bool
    allow_mid_match_join: bool
    allow_rebuys: bool
    allow_voluntary_leave: bool

    @model_validator(mode="after")
    def validate_cross_field_rules(self) -> "RoomRules":
        if self.small_blind > self.big_blind:
            raise ValueError("Small blind cannot exceed big blind")
        if self.end_mode is MatchEndMode.FIXED_HANDS and self.fixed_hand_count is None:
            raise ValueError("Fixed-hand mode requires fixed_hand_count")
        if self.end_mode is MatchEndMode.WINNER_TAKES_ALL and self.fixed_hand_count is not None:
            raise ValueError("Winner-takes-all mode cannot set fixed_hand_count")
        return self


__all__ = ["MatchEndMode", "RoomRules", "RoomVisibility"]
