"""Database-backed session lifecycle operations."""

from datetime import UTC, datetime, timedelta
from typing import Any, cast

from sqlalchemy import select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.accounts.models import Account, AccountSession, AccountStatus
from app.auth.session_tokens import SessionCredentials, SessionTokenService


class InactiveAccountError(ValueError):
    """Raised when a session is requested for a non-active account."""


class SessionService:
    def __init__(
        self,
        session_ttl_hours: int,
        token_service: SessionTokenService | None = None,
    ) -> None:
        self._session_ttl = timedelta(hours=session_ttl_hours)
        self._token_service = token_service or SessionTokenService()

    async def create(
        self,
        db_session: AsyncSession,
        account: Account,
        now: datetime | None = None,
    ) -> SessionCredentials:
        if account.status is not AccountStatus.ACTIVE:
            raise InactiveAccountError("Only active accounts can create sessions")

        issued_at = now or datetime.now(UTC)
        credentials = self._token_service.issue()
        db_session.add(
            AccountSession(
                account=account,
                token_hash=credentials.token_hash,
                expires_at=issued_at + self._session_ttl,
                last_activity_at=issued_at,
            )
        )
        await db_session.commit()
        return credentials

    async def authenticate(
        self,
        db_session: AsyncSession,
        token: str,
        now: datetime | None = None,
    ) -> Account | None:
        account_session = await db_session.scalar(
            select(AccountSession)
            .options(selectinload(AccountSession.account).selectinload(Account.profile))
            .where(AccountSession.token_hash == self._token_service.hash_token(token))
        )
        if account_session is None:
            return None

        current_time = now or datetime.now(UTC)
        if (
            account_session.revoked_at is not None
            or account_session.expires_at <= current_time
            or account_session.account.status is not AccountStatus.ACTIVE
        ):
            return None

        account_session.last_activity_at = current_time
        await db_session.commit()
        return account_session.account

    async def revoke(
        self,
        db_session: AsyncSession,
        token: str,
        now: datetime | None = None,
    ) -> bool:
        account_session = await db_session.scalar(
            select(AccountSession).where(
                AccountSession.token_hash == self._token_service.hash_token(token)
            )
        )
        if account_session is None or account_session.revoked_at is not None:
            return False

        account_session.revoked_at = now or datetime.now(UTC)
        await db_session.commit()
        return True

    async def revoke_all_for_account(
        self,
        db_session: AsyncSession,
        account_id: int,
        now: datetime | None = None,
    ) -> int:
        result = await db_session.execute(
            update(AccountSession)
            .where(
                AccountSession.account_id == account_id,
                AccountSession.revoked_at.is_(None),
            )
            .values(revoked_at=now or datetime.now(UTC))
        )
        await db_session.commit()
        cursor_result = cast(CursorResult[Any], result)
        return cursor_result.rowcount or 0
