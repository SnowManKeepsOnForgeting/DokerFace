"""HTTP endpoints for public player profiles."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.accounts.models import Account, AccountStatus
from app.auth.dependencies import get_current_account
from app.db.dependencies import get_db_session

router = APIRouter(prefix="/api/v1", tags=["players"])


class PublicPlayerResponse(BaseModel):
    account_id: int
    display_name: str
    avatar_path: str | None
    rank_badge_theme: str


class PlayerListResponse(BaseModel):
    items: list[PublicPlayerResponse]
    total: int
    offset: int
    limit: int


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1)
    rank_badge_theme: str | None = Field(default=None, min_length=1)


def to_public_player(account: Account) -> PublicPlayerResponse:
    if account.profile is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Account profile is missing",
        )
    return PublicPlayerResponse(
        account_id=account.account_id,
        display_name=account.profile.display_name,
        avatar_path=account.profile.avatar_path,
        rank_badge_theme=account.profile.rank_badge_theme,
    )


@router.get("/players", response_model=PlayerListResponse)
async def list_players(
    _: Annotated[Account, Depends(get_current_account)],
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
    offset: int = 0,
    limit: int = 20,
) -> PlayerListResponse:
    if offset < 0 or limit < 1 or limit > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid pagination parameters",
        )

    total = await db_session.scalar(
        select(func.count()).select_from(Account).where(Account.status != AccountStatus.DELETED)
    )
    accounts = list(
        (
            await db_session.scalars(
                select(Account)
                .options(selectinload(Account.profile))
                .where(Account.status != AccountStatus.DELETED)
                .order_by(Account.account_id)
                .offset(offset)
                .limit(limit)
            )
        ).all()
    )
    return PlayerListResponse(
        items=[to_public_player(account) for account in accounts],
        total=int(total or 0),
        offset=offset,
        limit=limit,
    )


@router.get("/players/{account_id}", response_model=PublicPlayerResponse)
async def get_player(
    account_id: int,
    _: Annotated[Account, Depends(get_current_account)],
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PublicPlayerResponse:
    account = await db_session.scalar(
        select(Account)
        .options(selectinload(Account.profile))
        .where(
            Account.account_id == account_id,
            Account.status != AccountStatus.DELETED,
        )
    )
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found")
    return to_public_player(account)


@router.patch("/me/profile", response_model=PublicPlayerResponse)
async def update_my_profile(
    payload: ProfileUpdateRequest,
    account: Annotated[Account, Depends(get_current_account)],
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PublicPlayerResponse:
    if payload.display_name is None and payload.rank_badge_theme is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one profile field is required",
        )
    if account.profile is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Account profile is missing",
        )

    if payload.display_name is not None:
        account.profile.display_name = payload.display_name
    if payload.rank_badge_theme is not None:
        account.profile.rank_badge_theme = payload.rank_badge_theme
    await db_session.commit()
    return to_public_player(account)
