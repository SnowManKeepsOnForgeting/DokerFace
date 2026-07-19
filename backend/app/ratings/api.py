"""Leaderboard, administrator rating reset, and player rating history endpoints."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account, Profile
from app.auth.dependencies import get_current_account, require_administrator
from app.db.dependencies import get_db_session
from app.ratings.models import RatingChangeRecord, RatingRecord
from app.ratings.service import RatingService
from app.statistics.models import PlayerStatisticsRecord

router = APIRouter(prefix="/api/v1", tags=["ratings"])


class LeaderboardEntry(BaseModel):
    rank: int
    account_id: int
    rating: float
    highest_rating: float
    completed_matches: int
    display_name: str
    avatar_text: str
    avatar_background_color: str
    rank_badge_theme: str
    win_rate: float
    last_change: float


class CurrentPlayerLeaderboardStats(BaseModel):
    rank: int | None
    rating: float
    highest_rating: float
    completed_matches: int
    diff_to_previous_player: float | None
    diff_to_next_rank: float | None


class LeaderboardResponse(BaseModel):
    batch_id: UUID | None
    items: list[LeaderboardEntry]
    total: int
    offset: int
    limit: int
    current_player_stats: CurrentPlayerLeaderboardStats | None = None


class RatingResetResponse(BaseModel):
    batch_id: UUID
    created_at: datetime
    initial_rating: int
    account_count: int


class PlayerRatingHistoryEntry(BaseModel):
    match_id: UUID
    before_rating: float
    delta: float
    after_rating: float
    finishing_rank: int
    created_at: datetime


class PlayerRatingHistoryResponse(BaseModel):
    items: list[PlayerRatingHistoryEntry]


@router.get("/leaderboard", response_model=LeaderboardResponse)
async def leaderboard(
    current_account: Annotated[Account, Depends(get_current_account)],
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
    search: str | None = None,
    rank_filter: str | None = None,
    only_with_matches: bool = False,
    offset: int = 0,
    limit: int = 50,
) -> LeaderboardResponse:
    if offset < 0 or limit < 1 or limit > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid pagination parameters",
        )
    service = RatingService()
    batch, entries, total = await service.leaderboard_entries(
        db_session,
        offset,
        limit,
        search=search,
        rank_filter=rank_filter,
        only_with_matches=only_with_matches,
    )
    if batch is None:
        return LeaderboardResponse(
            batch_id=None,
            items=[],
            total=0,
            offset=offset,
            limit=limit,
        )

    # Gather data for entries
    account_ids = [entry.account_id for entry in entries]

    profiles = (
        {
            p.account_id: p
            for p in await db_session.scalars(
                select(Profile).where(Profile.account_id.in_(account_ids))
            )
        }
        if account_ids
        else {}
    )

    stats = (
        {
            s.account_id: s
            for s in await db_session.scalars(
                select(PlayerStatisticsRecord).where(
                    PlayerStatisticsRecord.account_id.in_(account_ids)
                )
            )
        }
        if account_ids
        else {}
    )

    last_changes: dict[int, float] = {}
    if account_ids:
        changes_seq = list(
            (
                await db_session.scalars(
                    select(RatingChangeRecord)
                    .where(
                        RatingChangeRecord.batch_id == batch.batch_id,
                        RatingChangeRecord.account_id.in_(account_ids),
                    )
                    .order_by(
                        RatingChangeRecord.created_at.desc(),
                        RatingChangeRecord.rating_change_id.desc(),
                    )
                )
            ).all()
        )
        for c in changes_seq:
            if c.account_id not in last_changes:
                last_changes[c.account_id] = float(c.delta)

    items: list[LeaderboardEntry] = []
    for index, entry in enumerate(entries):
        profile = profiles.get(entry.account_id)
        stat = stats.get(entry.account_id)

        display_name = profile.display_name if profile else str(entry.account_id)
        avatar_text = profile.avatar_text if profile else display_name
        avatar_bg = profile.avatar_background_color if profile else "#64748B"
        badge_theme = profile.rank_badge_theme if profile else "default"

        win_rate = 0.0
        if stat is not None and stat.dealt_hands > 0:
            win_rate = float(stat.won_hands) / stat.dealt_hands

        items.append(
            LeaderboardEntry(
                rank=offset + index + 1,
                account_id=entry.account_id,
                rating=float(entry.rating),
                highest_rating=float(entry.highest_rating),
                completed_matches=entry.completed_matches,
                display_name=display_name,
                avatar_text=avatar_text,
                avatar_background_color=avatar_bg,
                rank_badge_theme=badge_theme,
                win_rate=win_rate,
                last_change=last_changes.get(entry.account_id, 0.0),
            )
        )

    # Compute current player leaderboard stats
    current_player_stats = None
    all_ratings = list(
        (
            await db_session.scalars(
                select(RatingRecord)
                .where(RatingRecord.batch_id == batch.batch_id)
                .order_by(
                    RatingRecord.rating.desc(),
                    RatingRecord.highest_rating.desc(),
                    RatingRecord.completed_matches.desc(),
                    RatingRecord.account_id,
                )
            )
        ).all()
    )

    current_player_index = None
    for idx, r in enumerate(all_ratings):
        if r.account_id == current_account.account_id:
            current_player_index = idx
            break

    if current_player_index is not None:
        r = all_ratings[current_player_index]
        diff_to_previous = None
        if current_player_index > 0:
            diff_to_previous = float(all_ratings[current_player_index - 1].rating - r.rating)

        # Compute diff to next rank
        rating_val = float(r.rating)
        diff_to_next_rank = None
        if rating_val < 850:
            diff_to_next_rank = 850.0 - rating_val
        elif rating_val < 950:
            diff_to_next_rank = 950.0 - rating_val
        elif rating_val < 1050:
            diff_to_next_rank = 1050.0 - rating_val
        elif rating_val < 1150:
            diff_to_next_rank = 1150.0 - rating_val
        elif rating_val < 1250:
            diff_to_next_rank = 1250.0 - rating_val

        current_player_stats = CurrentPlayerLeaderboardStats(
            rank=current_player_index + 1,
            rating=float(r.rating),
            highest_rating=float(r.highest_rating),
            completed_matches=r.completed_matches,
            diff_to_previous_player=diff_to_previous,
            diff_to_next_rank=diff_to_next_rank,
        )

    return LeaderboardResponse(
        batch_id=batch.batch_id,
        items=items,
        total=total,
        offset=offset,
        limit=limit,
        current_player_stats=current_player_stats,
    )


@router.post(
    "/admin/rating-resets",
    response_model=RatingResetResponse,
    status_code=status.HTTP_201_CREATED,
)
async def reset_ratings(
    administrator: Annotated[Account, Depends(require_administrator)],
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
) -> RatingResetResponse:
    batch = await RatingService().reset_batch(db_session, administrator.account_id)
    await db_session.commit()
    account_count = int(
        await db_session.scalar(
            select(func.count())
            .select_from(RatingRecord)
            .where(RatingRecord.batch_id == batch.batch_id)
        )
        or 0
    )
    return RatingResetResponse(
        batch_id=batch.batch_id,
        created_at=batch.created_at,
        initial_rating=1000,
        account_count=account_count,
    )


@router.get("/players/{account_id}/ratings", response_model=PlayerRatingHistoryResponse)
async def get_player_rating_history(
    account_id: int,
    _: Annotated[Account, Depends(get_current_account)],
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PlayerRatingHistoryResponse:
    batch = await RatingService().current_batch(db_session)
    if batch is None:
        return PlayerRatingHistoryResponse(items=[])

    changes = list(
        (
            await db_session.scalars(
                select(RatingChangeRecord)
                .where(
                    RatingChangeRecord.batch_id == batch.batch_id,
                    RatingChangeRecord.account_id == account_id,
                )
                .order_by(
                    RatingChangeRecord.created_at.asc(),
                    RatingChangeRecord.rating_change_id.asc(),
                )
            )
        ).all()
    )
    return PlayerRatingHistoryResponse(
        items=[
            PlayerRatingHistoryEntry(
                match_id=change.match_id,
                before_rating=float(change.before_rating),
                delta=float(change.delta),
                after_rating=float(change.after_rating),
                finishing_rank=change.finishing_rank,
                created_at=change.created_at,
            )
            for change in changes
        ]
    )


__all__ = ["router"]
