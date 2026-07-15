from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account, AccountRole, AccountSession, AccountStatus
from app.auth.session_tokens import SessionCredentials
from app.auth.sessions import InactiveAccountError, SessionService

NOW = datetime(2026, 7, 16, 12, 0, tzinfo=UTC)


def make_account(status: AccountStatus = AccountStatus.ACTIVE) -> Account:
    return Account(
        login_name="alice",
        password_hash="stored-hash",
        role=AccountRole.PLAYER,
        status=status,
    )


async def test_session_service_creates_expiring_session() -> None:
    db_session = AsyncMock(spec=AsyncSession)
    account = make_account()
    service = SessionService(session_ttl_hours=2)

    credentials = await service.create(db_session, account, now=NOW)

    assert isinstance(credentials, SessionCredentials)
    assert db_session.add.call_args is not None
    created_session = db_session.add.call_args.args[0]
    assert isinstance(created_session, AccountSession)
    assert created_session.account is account
    assert created_session.token_hash == credentials.token_hash
    assert created_session.expires_at == NOW + timedelta(hours=2)
    assert created_session.last_activity_at == NOW
    db_session.commit.assert_awaited_once()


async def test_session_service_rejects_inactive_account() -> None:
    db_session = AsyncMock(spec=AsyncSession)
    service = SessionService(session_ttl_hours=2)

    with pytest.raises(InactiveAccountError):
        await service.create(db_session, make_account(AccountStatus.DISABLED), now=NOW)

    db_session.add.assert_not_called()
    db_session.commit.assert_not_awaited()


async def test_session_service_authenticates_active_session_and_updates_activity() -> None:
    db_session = AsyncMock(spec=AsyncSession)
    account = make_account()
    account_session = AccountSession(
        account=account,
        token_hash="unused",
        expires_at=NOW + timedelta(hours=1),
        last_activity_at=NOW - timedelta(minutes=1),
    )
    db_session.scalar.return_value = account_session
    service = SessionService(session_ttl_hours=2)

    authenticated = await service.authenticate(db_session, "session-token", now=NOW)

    assert authenticated is account
    assert account_session.last_activity_at == NOW
    db_session.commit.assert_awaited_once()


@pytest.mark.parametrize(
    "account_session",
    [
        None,
        AccountSession(
            account=make_account(),
            token_hash="unused",
            expires_at=NOW,
            last_activity_at=NOW,
        ),
        AccountSession(
            account=make_account(),
            token_hash="unused",
            expires_at=NOW + timedelta(hours=1),
            revoked_at=NOW - timedelta(minutes=1),
            last_activity_at=NOW,
        ),
        AccountSession(
            account=make_account(AccountStatus.DISABLED),
            token_hash="unused",
            expires_at=NOW + timedelta(hours=1),
            last_activity_at=NOW,
        ),
    ],
)
async def test_session_service_rejects_invalid_sessions(
    account_session: AccountSession | None,
) -> None:
    db_session = AsyncMock(spec=AsyncSession)
    db_session.scalar.return_value = account_session
    service = SessionService(session_ttl_hours=2)

    authenticated = await service.authenticate(db_session, "session-token", now=NOW)

    assert authenticated is None
    db_session.commit.assert_not_awaited()


async def test_session_service_revokes_session_once() -> None:
    db_session = AsyncMock(spec=AsyncSession)
    account_session = AccountSession(
        account=make_account(),
        token_hash="unused",
        expires_at=NOW + timedelta(hours=1),
        last_activity_at=NOW,
    )
    db_session.scalar.return_value = account_session
    service = SessionService(session_ttl_hours=2)

    revoked = await service.revoke(db_session, "session-token", now=NOW)

    assert revoked
    assert account_session.revoked_at == NOW
    db_session.commit.assert_awaited_once()


async def test_session_service_revokes_all_active_account_sessions() -> None:
    db_session = AsyncMock(spec=AsyncSession)
    db_session.execute.return_value = SimpleNamespace(rowcount=2)
    service = SessionService(session_ttl_hours=2)

    revoked_count = await service.revoke_all_for_account(db_session, account_id=7, now=NOW)

    assert revoked_count == 2
    db_session.execute.assert_awaited_once()
    db_session.commit.assert_awaited_once()
