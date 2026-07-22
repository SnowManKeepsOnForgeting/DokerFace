"""HTTP endpoints for login, logout, and the current account."""

from datetime import UTC, datetime
from typing import Annotated, cast

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.accounts.models import Account, AccountRole, AccountStatus
from app.auth.dependencies import get_current_account
from app.auth.passwords import PasswordService
from app.auth.sessions import SessionService
from app.config import Settings
from app.db.dependencies import get_db_session

router = APIRouter(tags=["auth"])


class LoginRequest(BaseModel):
    login_name: str
    password: str
    remember: bool = False


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class CurrentUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    account_id: int
    login_name: str
    role: AccountRole
    status: AccountStatus
    display_name: str


def to_current_user(account: Account) -> CurrentUserResponse:
    return CurrentUserResponse(
        account_id=account.account_id,
        login_name=account.login_name,
        role=account.role,
        status=account.status,
        display_name=account.profile.display_name if account.profile else account.login_name,
    )


def set_session_cookie(
    response: Response,
    settings: Settings,
    token: str,
    remember: bool,
) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=settings.session_ttl_hours * 60 * 60 if remember else None,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
    )


@router.post("/api/v1/auth/login", response_model=CurrentUserResponse)
async def login(
    payload: LoginRequest,
    response: Response,
    request: Request,
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
) -> CurrentUserResponse:
    settings = cast(Settings, request.app.state.settings)
    account = await db_session.scalar(
        select(Account)
        .options(selectinload(Account.profile))
        .where(
            Account.login_name == payload.login_name,
            Account.status == AccountStatus.ACTIVE,
        )
    )
    if account is None or not PasswordService().verify(payload.password, account.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    account.last_login_at = datetime.now(UTC)
    credentials = await SessionService(settings.session_ttl_hours).create(db_session, account)
    set_session_cookie(response, settings, credentials.token, payload.remember)
    return to_current_user(account)


@router.post("/api/v1/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
) -> Response:
    settings = cast(Settings, request.app.state.settings)
    token = request.cookies.get(settings.session_cookie_name)
    if token:
        await SessionService(settings.session_ttl_hours).revoke(db_session, token)
    response.delete_cookie(
        key=settings.session_cookie_name,
        secure=settings.is_production,
        httponly=True,
        samesite="lax",
    )
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.post("/api/v1/me/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    response: Response,
    account: Annotated[Account, Depends(get_current_account)],
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
) -> Response:
    password_service = PasswordService()
    if not password_service.verify(payload.current_password, account.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    if not payload.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password is required",
        )

    account.password_hash = password_service.hash(payload.new_password)
    settings = cast(Settings, request.app.state.settings)
    await SessionService(settings.session_ttl_hours).revoke_all_for_account(
        db_session,
        account.account_id,
    )
    response.delete_cookie(
        key=settings.session_cookie_name,
        secure=settings.is_production,
        httponly=True,
        samesite="lax",
    )
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/api/v1/me", response_model=CurrentUserResponse)
async def current_user(
    account: Annotated[Account, Depends(get_current_account)],
) -> CurrentUserResponse:
    return to_current_user(account)
