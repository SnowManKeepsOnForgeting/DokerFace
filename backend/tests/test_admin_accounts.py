from typing import cast
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account, AccountRole, AccountStatus
from app.admin.accounts import (
    AccountAdminService,
    AccountAlreadyExistsError,
    AccountPermissionError,
)
from app.admin.models import AdminAuditLog
from app.auth.passwords import PasswordService


def make_administrator() -> Account:
    return Account(
        account_id=1,
        login_name="admin",
        password_hash="stored-hash",
        role=AccountRole.ADMINISTRATOR,
    )


async def test_account_admin_service_creates_account_and_audit_log() -> None:
    db_session = AsyncMock(spec=AsyncSession)

    async def assign_identity() -> None:
        assert db_session.add.call_args is not None
        account = cast(Account, db_session.add.call_args.args[0])
        account.account_id = 2
        account.status = AccountStatus.ACTIVE

    db_session.scalar.return_value = None
    db_session.flush.side_effect = assign_identity
    password_service = PasswordService()
    service = AccountAdminService(password_service)

    account = await service.create_account(
        db_session,
        make_administrator(),
        login_name="alice",
        password="player password",
        display_name="Alice",
    )

    assert account.account_id == 2
    assert account.login_name == "alice"
    assert account.profile is not None
    assert account.profile.display_name == "Alice"
    assert password_service.verify("player password", account.password_hash)
    assert db_session.add.call_count == 2
    assert isinstance(db_session.add.call_args_list[1].args[0], AdminAuditLog)
    audit_log = db_session.add.call_args_list[1].args[0]
    assert audit_log.action == "account_created"
    assert audit_log.target_account_id == 2
    db_session.commit.assert_awaited_once()


async def test_account_admin_service_rejects_duplicate_login_name() -> None:
    db_session = AsyncMock(spec=AsyncSession)
    db_session.scalar.return_value = Account(
        account_id=2,
        login_name="alice",
        password_hash="stored-hash",
        role=AccountRole.PLAYER,
    )

    with pytest.raises(AccountAlreadyExistsError):
        await AccountAdminService().create_account(
            db_session,
            make_administrator(),
            login_name="alice",
            password="player password",
        )

    db_session.add.assert_not_called()
    db_session.commit.assert_not_awaited()


async def test_account_admin_service_rejects_non_administrator() -> None:
    db_session = AsyncMock(spec=AsyncSession)
    player = make_administrator()
    player.role = AccountRole.PLAYER

    with pytest.raises(AccountPermissionError):
        await AccountAdminService().create_account(
            db_session,
            player,
            login_name="alice",
            password="player password",
        )

    db_session.scalar.assert_not_awaited()
