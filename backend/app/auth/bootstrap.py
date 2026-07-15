"""Administrator bootstrap for the first application startup."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import (
    DEFAULT_AVATAR_BACKGROUND_COLOR,
    Account,
    AccountRole,
    Profile,
)
from app.auth.passwords import PasswordService


class BootstrapConfigurationError(RuntimeError):
    """Raised when a fresh database has no usable bootstrap administrator config."""


async def ensure_bootstrap_admin(
    session: AsyncSession,
    login_name: str | None,
    password: str | None,
    password_service: PasswordService | None = None,
) -> bool:
    existing_admin = await session.scalar(
        select(Account).where(Account.role == AccountRole.ADMINISTRATOR).limit(1)
    )
    if existing_admin is not None:
        return False

    if not login_name or not login_name.strip() or not password:
        raise BootstrapConfigurationError(
            "Bootstrap administrator credentials are required when no administrator exists"
        )

    hasher = password_service or PasswordService()
    account = Account(
        login_name=login_name,
        password_hash=hasher.hash(password),
        role=AccountRole.ADMINISTRATOR,
        profile=Profile(
            display_name=login_name,
            avatar_text=login_name,
            avatar_background_color=DEFAULT_AVATAR_BACKGROUND_COLOR,
        ),
    )
    session.add(account)
    await session.commit()
    return True
