"""Administrator operations on account records."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account, AccountRole, Profile
from app.admin.models import AdminAuditLog
from app.auth.passwords import PasswordService


class AccountManagementError(ValueError):
    """Base error for administrator account operations."""


class AccountAlreadyExistsError(AccountManagementError):
    """Raised when an account login name is already in use."""


class AccountPermissionError(AccountManagementError):
    """Raised when an account operation is attempted by a non-administrator."""


def account_snapshot(account: Account) -> dict[str, object]:
    return {
        "login_name": account.login_name,
        "role": account.role.value,
        "status": account.status.value,
        "display_name": account.profile.display_name if account.profile else account.login_name,
    }


class AccountAdminService:
    def __init__(self, password_service: PasswordService | None = None) -> None:
        self._password_service = password_service or PasswordService()

    @staticmethod
    def _require_administrator(administrator: Account) -> None:
        if administrator.role is not AccountRole.ADMINISTRATOR:
            raise AccountPermissionError("Administrator permission required")

    async def create_account(
        self,
        db_session: AsyncSession,
        administrator: Account,
        login_name: str,
        password: str,
        display_name: str | None = None,
        role: AccountRole = AccountRole.PLAYER,
    ) -> Account:
        self._require_administrator(administrator)
        if not login_name.strip() or not password:
            raise AccountManagementError("Login name and password are required")

        existing_account = await db_session.scalar(
            select(Account).where(Account.login_name == login_name).limit(1)
        )
        if existing_account is not None:
            raise AccountAlreadyExistsError("Login name is already in use")

        account = Account(
            login_name=login_name,
            password_hash=self._password_service.hash(password),
            role=role,
            profile=Profile(display_name=display_name or login_name),
        )
        db_session.add(account)
        await db_session.flush()
        db_session.add(
            AdminAuditLog(
                administrator_account_id=administrator.account_id,
                action="account_created",
                target_account_id=account.account_id,
                after_state=account_snapshot(account),
            )
        )
        await db_session.commit()
        await db_session.refresh(account)
        return account
