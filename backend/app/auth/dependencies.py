"""FastAPI dependencies for cookie-authenticated accounts."""

from typing import Annotated, cast

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account, AccountRole
from app.auth.sessions import SessionService
from app.config import Settings
from app.db.dependencies import get_db_session


async def get_current_account(
    request: Request,
    db_session: Annotated[AsyncSession, Depends(get_db_session)],
) -> Account:
    settings = cast(Settings, request.app.state.settings)
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    account = await SessionService(settings.session_ttl_hours).authenticate(db_session, token)
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return account


async def require_administrator(
    account: Annotated[Account, Depends(get_current_account)],
) -> Account:
    if account.role is not AccountRole.ADMINISTRATOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator permission required",
        )
    return account
