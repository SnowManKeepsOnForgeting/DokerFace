"""Authenticated match and hand history endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.accounts.models import Account
from app.auth.dependencies import get_current_account
from app.db.dependencies import get_db_session
from app.matches.models import (
    HandPlayerRecord,
    HandRecord,
    MatchPlayerRecord,
    MatchRecord,
)

router = APIRouter(prefix="/api/v1", tags=["matches"])


class MatchPlayerHistoryResponse(BaseModel):
    account_id: int
    seat: int
    display_name: str
    initial_chips: int
    final_chips: int | None
    finishing_rank: int | None
    exit_reason: str | None


class MatchSummaryResponse(BaseModel):
    match_id: UUID
    room_id: UUID
    end_mode: str
    status: str
    started_at: datetime
    completed_at: datetime | None
    void_reason: str | None
    players: list[MatchPlayerHistoryResponse]


class MatchListResponse(BaseModel):
    items: list[MatchSummaryResponse]
    total: int
    offset: int
    limit: int


class ActionHistoryResponse(BaseModel):
    sequence_no: int
    state_version: int
    account_id: int
    street: str
    action: str
    amount: int | None
    created_at: datetime


class HandPlayerHistoryResponse(BaseModel):
    account_id: int
    hole_cards: list[str] | None
    folded: bool
    all_in: bool
    shown: bool
    invested_chips: int
    won_chips: int


class PotHistoryResponse(BaseModel):
    pot_number: int
    amount: int
    eligible_account_ids: list[int]
    winner_payouts: dict[str, int]


class HandHistoryResponse(BaseModel):
    hand_id: UUID
    match_id: UUID
    hand_number: int
    button_account_id: int
    small_blind: int
    big_blind: int
    status: str
    public_board: list[str]
    settlement_summary: dict[str, object] | None
    players: list[HandPlayerHistoryResponse]
    actions: list[ActionHistoryResponse]
    pots: list[PotHistoryResponse]
    started_at: datetime
    settled_at: datetime | None


class MatchHistoryResponse(MatchSummaryResponse):
    hands: list[HandHistoryResponse]


def _visible_hole_cards(
    player: HandPlayerRecord,
    viewer_account_id: int,
) -> list[str] | None:
    if player.account_id != viewer_account_id and not player.shown:
        return None
    return list(player.hole_cards) if player.hole_cards is not None else None


def to_match_player_response(player: MatchPlayerRecord) -> MatchPlayerHistoryResponse:
    return MatchPlayerHistoryResponse(
        account_id=player.account_id,
        seat=player.seat,
        display_name=player.display_name,
        initial_chips=player.initial_chips,
        final_chips=player.final_chips,
        finishing_rank=player.finishing_rank,
        exit_reason=player.exit_reason,
    )


def _to_hand_response(hand: HandRecord, viewer_account_id: int) -> HandHistoryResponse:
    return HandHistoryResponse(
        hand_id=hand.hand_id,
        match_id=hand.match_id,
        hand_number=hand.hand_number,
        button_account_id=hand.button_account_id,
        small_blind=hand.small_blind,
        big_blind=hand.big_blind,
        status=hand.status,
        public_board=list(hand.public_board),
        settlement_summary=hand.settlement_summary,
        players=[
            HandPlayerHistoryResponse(
                account_id=player.account_id,
                hole_cards=_visible_hole_cards(player, viewer_account_id),
                folded=player.folded,
                all_in=player.all_in,
                shown=player.shown,
                invested_chips=player.invested_chips,
                won_chips=player.won_chips,
            )
            for player in hand.players
        ],
        actions=[
            ActionHistoryResponse(
                sequence_no=action.sequence_no,
                state_version=action.state_version,
                account_id=action.account_id,
                street=action.street,
                action=action.action,
                amount=action.amount,
                created_at=action.created_at,
            )
            for action in hand.actions
        ],
        pots=[
            PotHistoryResponse(
                pot_number=pot.pot_number,
                amount=pot.amount,
                eligible_account_ids=list(pot.eligible_account_ids),
                winner_payouts=pot.winner_payouts,
            )
            for pot in hand.pots
        ],
        started_at=hand.started_at,
        settled_at=hand.settled_at,
    )


def to_match_summary(match: MatchRecord) -> MatchSummaryResponse:
    return MatchSummaryResponse(
        match_id=match.match_id,
        room_id=match.room_id,
        end_mode=match.end_mode,
        status=match.status,
        started_at=match.started_at,
        completed_at=match.completed_at,
        void_reason=match.void_reason,
        players=[to_match_player_response(player) for player in match.players],
    )


def _history_options():
    return (
        selectinload(MatchRecord.players),
        selectinload(MatchRecord.hands).selectinload(HandRecord.players),
        selectinload(MatchRecord.hands).selectinload(HandRecord.actions),
        selectinload(MatchRecord.hands).selectinload(HandRecord.pots),
    )


@router.get("/players/{account_id}/matches", response_model=MatchListResponse)
async def list_player_matches(
    account_id: int,
    _: Annotated[Account, Depends(get_current_account)],
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
    offset: int = 0,
    limit: int = 20,
) -> MatchListResponse:
    if offset < 0 or limit < 1 or limit > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid pagination parameters",
        )
    total = await db_session.scalar(
        select(func.count())
        .select_from(MatchPlayerRecord)
        .where(MatchPlayerRecord.account_id == account_id)
    )
    matches = list(
        (
            await db_session.scalars(
                select(MatchRecord)
                .join(MatchPlayerRecord)
                .options(selectinload(MatchRecord.players))
                .where(MatchPlayerRecord.account_id == account_id)
                .order_by(MatchRecord.started_at.desc(), MatchRecord.match_id)
                .offset(offset)
                .limit(limit)
            )
        ).all()
    )
    return MatchListResponse(
        items=[to_match_summary(match) for match in matches],
        total=int(total or 0),
        offset=offset,
        limit=limit,
    )


@router.get("/matches/{match_id}", response_model=MatchHistoryResponse)
async def get_match_history(
    match_id: UUID,
    account: Annotated[Account, Depends(get_current_account)],
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MatchHistoryResponse:
    match = await db_session.scalar(
        select(MatchRecord).options(*_history_options()).where(MatchRecord.match_id == match_id)
    )
    if match is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")
    summary = to_match_summary(match)
    return MatchHistoryResponse(
        **summary.model_dump(),
        hands=[_to_hand_response(hand, account.account_id) for hand in match.hands],
    )


@router.get("/hands/{hand_id}", response_model=HandHistoryResponse)
async def get_hand_history(
    hand_id: UUID,
    account: Annotated[Account, Depends(get_current_account)],
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
) -> HandHistoryResponse:
    hand = await db_session.scalar(
        select(HandRecord)
        .options(
            selectinload(HandRecord.players),
            selectinload(HandRecord.actions),
            selectinload(HandRecord.pots),
        )
        .where(HandRecord.hand_id == hand_id)
    )
    if hand is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hand not found")
    return _to_hand_response(hand, account.account_id)


__all__ = [
    "MatchPlayerHistoryResponse",
    "MatchSummaryResponse",
    "router",
    "to_match_player_response",
    "to_match_summary",
]
