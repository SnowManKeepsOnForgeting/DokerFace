from typing import cast
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account, AccountRole
from app.auth.bootstrap import BootstrapConfigurationError, ensure_bootstrap_admin
from app.auth.passwords import PasswordService


async def test_bootstrap_creates_administrator_with_hashed_password() -> None:
    session = AsyncMock(spec=AsyncSession)
    session.scalar.return_value = None
    password_service = PasswordService()

    created = await ensure_bootstrap_admin(
        session,
        login_name="admin",
        password="initial password",
        password_service=password_service,
    )

    assert created
    session.add.assert_called_once()
    session.commit.assert_awaited_once()
    assert session.add.call_args is not None
    account = cast(Account, session.add.call_args.args[0])
    assert account.login_name == "admin"
    assert account.role is AccountRole.ADMINISTRATOR
    assert account.profile is not None
    assert account.profile.display_name == "admin"
    assert account.profile.avatar_text == "admin"
    assert account.profile.avatar_background_color == "#64748B"
    assert account.password_hash != "initial password"
    assert password_service.verify("initial password", account.password_hash)


async def test_bootstrap_does_not_require_credentials_when_admin_exists() -> None:
    session = AsyncMock(spec=AsyncSession)
    session.scalar.return_value = Account(
        login_name="existing-admin",
        password_hash="stored-hash",
        role=AccountRole.ADMINISTRATOR,
    )

    created = await ensure_bootstrap_admin(session, login_name=None, password=None)

    assert not created
    session.add.assert_not_called()
    session.commit.assert_not_awaited()


@pytest.mark.parametrize(
    ("login_name", "password"),
    [(None, "password"), ("admin", None), ("   ", "password")],
)
async def test_bootstrap_rejects_missing_credentials(
    login_name: str | None,
    password: str | None,
) -> None:
    session = AsyncMock(spec=AsyncSession)
    session.scalar.return_value = None

    with pytest.raises(BootstrapConfigurationError):
        await ensure_bootstrap_admin(session, login_name, password)

    session.add.assert_not_called()
    session.commit.assert_not_awaited()
