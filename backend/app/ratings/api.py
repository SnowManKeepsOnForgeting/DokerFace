"""Leaderboard and administrator rating reset endpoints."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account
from app.auth.dependencies import get_current_account, require_administrator
from app.db.dependencies import get_db_session
from app.ratings.models import RatingRecord
from app.ratings.service import RatingService

router = APIRouter(prefix="/api/v1", tags=["ratings"])


class LeaderboardEntry(BaseModel):
    rank: int
    account_id: int
    rating: float
    highest_rating: float
    completed_matches: int


class LeaderboardResponse(BaseModel):
    batch_id: UUID | None
    items: list[LeaderboardEntry]
    total: int
    offset: int
    limit: int


class RatingResetResponse(BaseModel):
    batch_id: UUID
    created_at: datetime
    initial_rating: int
    account_count: int


@router.get("/leaderboard", response_model=LeaderboardResponse)
async def leaderboard(
    _: Annotated[Account, Depends(get_current_account)],
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
    offset: int = 0,
    limit: int = 50,
) -> LeaderboardResponse:
    if offset < 0 or limit < 1 or limit > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid pagination parameters",
        )
    service = RatingService()
    batch, entries = await service.leaderboard_entries(db_session, offset, limit)
    total = 0
    if batch is not None:
        total = int(
            await db_session.scalar(
                select(func.count())
                .select_from(RatingRecord)
                .where(RatingRecord.batch_id == batch.batch_id)
            )
            or 0
        )
    return LeaderboardResponse(
        batch_id=batch.batch_id if batch is not None else None,
        items=[
            LeaderboardEntry(
                rank=offset + index + 1,
                account_id=entry.account_id,
                rating=float(entry.rating),
                highest_rating=float(entry.highest_rating),
                completed_matches=entry.completed_matches,
            )
            for index, entry in enumerate(entries)
        ],
        total=total,
        offset=offset,
        limit=limit,
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


__all__ = ["router"]
