"""Public player statistics endpoint."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account, AccountStatus
from app.auth.dependencies import get_current_account
from app.db.dependencies import get_db_session
from app.statistics.models import PlayerStatisticsRecord
from app.statistics.reducer import PlayerStatistics

router = APIRouter(prefix="/api/v1", tags=["statistics"])


class PlayerStatisticsResponse(BaseModel):
    account_id: int
    reducer_version: int
    dealt_hands: int
    won_hands: int
    matches_played: int
    profitable_matches: int
    vpip_opportunities: int
    vpip: int
    vpip_rate: float | None
    pfr_opportunities: int
    pfr: int
    pfr_rate: float | None
    three_bet_opportunities: int
    three_bets: int
    three_bet_rate: float | None
    showdown_opportunities: int
    showdowns: int
    showdown_wins: int
    showdown_rate: float | None
    showdown_win_rate: float | None
    decisions: int
    folds: int
    fold_rate: float | None
    all_ins: int
    pot_total: int
    pot_count: int
    average_pot: float | None
    position_counts: dict[str, int]


def _to_statistics_response(
    statistics: PlayerStatistics,
    reducer_version: int,
) -> PlayerStatisticsResponse:
    return PlayerStatisticsResponse(
        account_id=statistics.account_id,
        reducer_version=reducer_version,
        dealt_hands=statistics.dealt_hands,
        won_hands=statistics.won_hands,
        matches_played=statistics.matches_played,
        profitable_matches=statistics.profitable_matches,
        vpip_opportunities=statistics.vpip_opportunities,
        vpip=statistics.vpip,
        vpip_rate=statistics.vpip_rate,
        pfr_opportunities=statistics.pfr_opportunities,
        pfr=statistics.pfr,
        pfr_rate=statistics.pfr_rate,
        three_bet_opportunities=statistics.three_bet_opportunities,
        three_bets=statistics.three_bets,
        three_bet_rate=statistics.three_bet_rate,
        showdown_opportunities=statistics.showdown_opportunities,
        showdowns=statistics.showdowns,
        showdown_wins=statistics.showdown_wins,
        showdown_rate=statistics.showdown_rate,
        showdown_win_rate=statistics.showdown_win_rate,
        decisions=statistics.decisions,
        folds=statistics.folds,
        fold_rate=statistics.fold_rate,
        all_ins=statistics.all_ins,
        pot_total=statistics.pot_total,
        pot_count=statistics.pot_count,
        average_pot=statistics.average_pot,
        position_counts=statistics.position_counts,
    )


@router.get("/players/{account_id}/statistics", response_model=PlayerStatisticsResponse)
async def get_player_statistics(
    account_id: int,
    _: Annotated[Account, Depends(get_current_account)],
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PlayerStatisticsResponse:
    account = await db_session.scalar(
        select(Account).where(
            Account.account_id == account_id,
            Account.status != AccountStatus.DELETED,
        )
    )
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found")
    record = await db_session.scalar(
        select(PlayerStatisticsRecord).where(PlayerStatisticsRecord.account_id == account_id)
    )
    if record is None:
        return _to_statistics_response(
            PlayerStatistics(account_id=account_id),
            reducer_version=1,
        )
    return _to_statistics_response(
        PlayerStatistics(
            account_id=record.account_id,
            dealt_hands=record.dealt_hands,
            won_hands=record.won_hands,
            matches_played=record.matches_played,
            profitable_matches=record.profitable_matches,
            vpip_opportunities=record.vpip_opportunities,
            vpip=record.vpip,
            pfr_opportunities=record.pfr_opportunities,
            pfr=record.pfr,
            three_bet_opportunities=record.three_bet_opportunities,
            three_bets=record.three_bets,
            showdown_opportunities=record.showdown_opportunities,
            showdowns=record.showdowns,
            showdown_wins=record.showdown_wins,
            decisions=record.decisions,
            folds=record.folds,
            all_ins=record.all_ins,
            pot_total=record.pot_total,
            pot_count=record.pot_count,
            position_counts=dict(record.position_counts),
        ),
        reducer_version=record.reducer_version,
    )


__all__ = ["PlayerStatisticsResponse", "router"]
