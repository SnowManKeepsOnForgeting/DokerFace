from datetime import UTC, datetime
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account, AccountRole, AccountStatus, Profile
from app.admin.accounts import (
    AccountAdminService,
    AccountAlreadyExistsError,
    AccountPermissionError,
    InvalidAccountStateError,
    LastAdministratorError,
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


NOW = datetime(2026, 7, 16, 12, 0, tzinfo=UTC)


def make_target(
    *,
    account_id: int = 3,
    role: AccountRole = AccountRole.PLAYER,
    status: AccountStatus = AccountStatus.ACTIVE,
) -> Account:
    return Account(
        account_id=account_id,
        login_name="alice",
        password_hash=PasswordService().hash("old password"),
        role=role,
        status=status,
        profile=Profile(display_name="Alice", avatar_text="Alice"),
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
    assert account.profile.avatar_text == "Alice"
    assert account.profile.avatar_background_color == "#64748B"
    assert password_service.verify("player password", account.password_hash)
    assert db_session.add.call_count == 4
    assert isinstance(db_session.add.call_args_list[3].args[0], AdminAuditLog)
    audit_log = db_session.add.call_args_list[3].args[0]
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


async def test_account_admin_service_disables_account_and_revokes_sessions() -> None:
    db_session = AsyncMock(spec=AsyncSession)
    db_session.scalar.return_value = make_target()
    db_session.execute.return_value = SimpleNamespace(rowcount=1)

    account = await AccountAdminService().disable_account(
        db_session,
        make_administrator(),
        account_id=3,
        now=NOW,
    )

    assert account.status is AccountStatus.DISABLED
    db_session.execute.assert_awaited_once()
    db_session.commit.assert_awaited_once()
    audit_log = db_session.add.call_args.args[0]
    assert audit_log.action == "account_disabled"


async def test_account_admin_service_restores_disabled_account() -> None:
    db_session = AsyncMock(spec=AsyncSession)
    db_session.scalar.return_value = make_target(status=AccountStatus.DISABLED)

    account = await AccountAdminService().restore_account(
        db_session,
        make_administrator(),
        account_id=3,
    )

    assert account.status is AccountStatus.ACTIVE
    db_session.commit.assert_awaited_once()
    assert db_session.add.call_args.args[0].action == "account_restored"


async def test_account_admin_service_soft_deletes_account() -> None:
    db_session = AsyncMock(spec=AsyncSession)
    db_session.scalar.return_value = make_target()
    db_session.execute.return_value = SimpleNamespace(rowcount=1)

    account = await AccountAdminService().soft_delete_account(
        db_session,
        make_administrator(),
        account_id=3,
        now=NOW,
    )

    assert account.status is AccountStatus.DELETED
    db_session.execute.assert_awaited_once()
    db_session.commit.assert_awaited_once()
    assert db_session.add.call_args.args[0].action == "account_deleted"


async def test_account_admin_service_updates_role() -> None:
    db_session = AsyncMock(spec=AsyncSession)
    db_session.scalar.return_value = make_target()

    account = await AccountAdminService().update_role(
        db_session,
        make_administrator(),
        account_id=3,
        role=AccountRole.ADMINISTRATOR,
    )

    assert account.role is AccountRole.ADMINISTRATOR
    db_session.commit.assert_awaited_once()
    assert db_session.add.call_args.args[0].action == "account_role_updated"


async def test_account_admin_service_rejects_removing_last_administrator() -> None:
    db_session = AsyncMock(spec=AsyncSession)
    db_session.scalar.side_effect = [
        make_target(role=AccountRole.ADMINISTRATOR),
        1,
    ]

    with pytest.raises(LastAdministratorError):
        await AccountAdminService().update_role(
            db_session,
            make_administrator(),
            account_id=3,
            role=AccountRole.PLAYER,
        )

    db_session.add.assert_not_called()
    db_session.commit.assert_not_awaited()


async def test_account_admin_service_resets_password_and_revokes_sessions() -> None:
    db_session = AsyncMock(spec=AsyncSession)
    target = make_target()
    old_hash = target.password_hash
    db_session.scalar.return_value = target
    db_session.execute.return_value = SimpleNamespace(rowcount=1)
    password_service = PasswordService()

    account = await AccountAdminService(password_service).reset_password(
        db_session,
        make_administrator(),
        account_id=3,
        password="new password",
        now=NOW,
    )

    assert account.password_hash != old_hash
    assert password_service.verify("new password", account.password_hash)
    db_session.execute.assert_awaited_once()
    db_session.commit.assert_awaited_once()
    audit_log = db_session.add.call_args.args[0]
    assert audit_log.action == "account_password_reset"
    assert audit_log.after_state["password_reset"] is True
    assert "password_hash" not in audit_log.after_state


async def test_account_admin_service_rejects_resetting_deleted_account() -> None:
    db_session = AsyncMock(spec=AsyncSession)
    db_session.scalar.return_value = make_target(status=AccountStatus.DELETED)

    with pytest.raises(InvalidAccountStateError):
        await AccountAdminService().reset_password(
            db_session,
            make_administrator(),
            account_id=3,
            password="new password",
        )

    db_session.commit.assert_not_awaited()
