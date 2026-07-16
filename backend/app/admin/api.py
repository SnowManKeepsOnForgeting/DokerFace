"""HTTP endpoints for administrator account management."""

from typing import Annotated, Never
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account, AccountRole, AccountStatus
from app.admin.accounts import (
    AccountAdminService,
    AccountAlreadyExistsError,
    AccountManagementError,
    AccountNotFoundError,
    LastAdministratorError,
)
from app.auth.api import CurrentUserResponse, to_current_user
from app.auth.dependencies import require_administrator
from app.db.dependencies import get_db_session
from app.matches.persistence import MatchHistoryPersistenceService
from app.ratings.service import RatingService

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


class CreateAccountRequest(BaseModel):
    login_name: str
    password: str
    display_name: str | None = None
    role: AccountRole = AccountRole.PLAYER


class UpdateAccountRequest(BaseModel):
    status: AccountStatus | None = None
    role: AccountRole | None = None


class ResetPasswordRequest(BaseModel):
    password: str


class VoidMatchRequest(BaseModel):
    reason: str


class VoidMatchResponse(BaseModel):
    match_id: UUID
    status: str
    void_reason: str


def raise_account_http_error(error: AccountManagementError) -> Never:
    if isinstance(error, AccountAlreadyExistsError):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    if isinstance(error, AccountNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    if isinstance(error, LastAdministratorError):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error


@router.post(
    "/accounts",
    response_model=CurrentUserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_account(
    payload: CreateAccountRequest,
    administrator: Annotated[Account, Depends(require_administrator)],
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
) -> CurrentUserResponse:
    try:
        account = await AccountAdminService().create_account(
            db_session,
            administrator,
            login_name=payload.login_name,
            password=payload.password,
            display_name=payload.display_name,
            role=payload.role,
        )
    except AccountManagementError as error:
        raise_account_http_error(error)
    return to_current_user(account)


@router.patch("/accounts/{account_id}", response_model=CurrentUserResponse)
async def update_account(
    account_id: int,
    payload: UpdateAccountRequest,
    administrator: Annotated[Account, Depends(require_administrator)],
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
) -> CurrentUserResponse:
    if payload.status is None and payload.role is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one account field is required",
        )
    if payload.status is not None and payload.role is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Update status and role separately",
        )

    service = AccountAdminService()
    try:
        if payload.status is AccountStatus.DISABLED:
            account = await service.disable_account(db_session, administrator, account_id)
        elif payload.status is AccountStatus.ACTIVE:
            account = await service.restore_account(db_session, administrator, account_id)
        elif payload.status is AccountStatus.DELETED:
            account = await service.soft_delete_account(db_session, administrator, account_id)
        else:
            assert payload.role is not None
            account = await service.update_role(
                db_session,
                administrator,
                account_id,
                payload.role,
            )
    except AccountManagementError as error:
        raise_account_http_error(error)
    return to_current_user(account)


@router.post(
    "/accounts/{account_id}/reset-password",
    response_model=CurrentUserResponse,
)
async def reset_password(
    account_id: int,
    payload: ResetPasswordRequest,
    administrator: Annotated[Account, Depends(require_administrator)],
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
) -> CurrentUserResponse:
    try:
        account = await AccountAdminService().reset_password(
            db_session,
            administrator,
            account_id,
            payload.password,
        )
    except AccountManagementError as error:
        raise_account_http_error(error)
    return to_current_user(account)


@router.post(
    "/matches/{match_id}/void",
    response_model=VoidMatchResponse,
)
async def void_match(
    match_id: UUID,
    payload: VoidMatchRequest,
    _: Annotated[Account, Depends(require_administrator)],
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
) -> VoidMatchResponse:
    if not payload.reason.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Void reason is required",
        )
    try:
        async with db_session.begin():
            match = await MatchHistoryPersistenceService().void_match(
                db_session,
                match_id=match_id,
                reason=payload.reason.strip(),
            )
            await RatingService().rebuild_current_batch(db_session)
    except ValueError as error:
        detail = str(error)
        error_status = (
            status.HTTP_404_NOT_FOUND if "not found" in detail else status.HTTP_409_CONFLICT
        )
        raise HTTPException(status_code=error_status, detail=detail) from error
    return VoidMatchResponse(
        match_id=match.match_id,
        status=match.status,
        void_reason=match.void_reason or payload.reason.strip(),
    )
