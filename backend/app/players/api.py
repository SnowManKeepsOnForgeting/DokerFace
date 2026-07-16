"""HTTP endpoints for public player profiles."""

import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.accounts.models import Account, AccountStatus
from app.auth.dependencies import get_current_account
from app.db.dependencies import get_db_session
from app.realtime.connections import ConnectionRegistry

router = APIRouter(prefix="/api/v1", tags=["players"])


class PublicPlayerResponse(BaseModel):
    account_id: int
    display_name: str
    avatar_text: str
    avatar_background_color: str
    rank_badge_theme: str
    is_online: bool


class PlayerListResponse(BaseModel):
    items: list[PublicPlayerResponse]
    total: int
    offset: int
    limit: int


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1)
    avatar_text: str | None = Field(default=None, min_length=1)
    avatar_background_color: str | None = Field(default=None)
    rank_badge_theme: str | None = Field(default=None, min_length=1)

    @field_validator("avatar_text")
    @classmethod
    def validate_avatar_text(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("Avatar text must not be blank")
        return value

    @field_validator("avatar_background_color")
    @classmethod
    def normalize_avatar_background_color(cls, value: str | None) -> str | None:
        if value is not None and re.fullmatch(r"#[0-9a-fA-F]{6}", value) is None:
            raise ValueError("Avatar background color must be a six-digit hex color")
        return value.upper() if value is not None else None


def to_public_player(
    account: Account,
    connection_registry: ConnectionRegistry | None = None,
) -> PublicPlayerResponse:
    if account.profile is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Account profile is missing",
        )
    is_online = False
    if connection_registry is not None:
        is_online = connection_registry.sid_for_account(account.account_id) is not None

    return PublicPlayerResponse(
        account_id=account.account_id,
        display_name=account.profile.display_name,
        avatar_text=account.profile.avatar_text,
        avatar_background_color=account.profile.avatar_background_color,
        rank_badge_theme=account.profile.rank_badge_theme,
        is_online=is_online,
    )


@router.get("/players", response_model=PlayerListResponse)
async def list_players(
    _: Annotated[Account, Depends(get_current_account)],
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
    request: Request,
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
    connection_registry = getattr(request.app.state, "connection_registry", None)
    return PlayerListResponse(
        items=[to_public_player(account, connection_registry) for account in accounts],
        total=int(total or 0),
        offset=offset,
        limit=limit,
    )


@router.get("/players/{account_id}", response_model=PublicPlayerResponse)
async def get_player(
    account_id: int,
    _: Annotated[Account, Depends(get_current_account)],
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
    request: Request,
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
    connection_registry = getattr(request.app.state, "connection_registry", None)
    return to_public_player(account, connection_registry)


@router.patch("/me/profile", response_model=PublicPlayerResponse)
async def update_my_profile(
    payload: ProfileUpdateRequest,
    account: Annotated[Account, Depends(get_current_account)],
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PublicPlayerResponse:
    if (
        payload.display_name is None
        and payload.avatar_text is None
        and payload.avatar_background_color is None
        and payload.rank_badge_theme is None
    ):
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
    if payload.avatar_text is not None:
        account.profile.avatar_text = payload.avatar_text
    if payload.avatar_background_color is not None:
        account.profile.avatar_background_color = payload.avatar_background_color
    if payload.rank_badge_theme is not None:
        account.profile.rank_badge_theme = payload.rank_badge_theme
    await db_session.commit()
    return to_public_player(account)
