"""Administrator operations on account records."""

from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.accounts.models import (
    DEFAULT_AVATAR_BACKGROUND_COLOR,
    Account,
    AccountRole,
    AccountSession,
    AccountStatus,
    Profile,
)
from app.admin.models import AdminAuditLog
from app.auth.passwords import PasswordService


class AccountManagementError(ValueError):
    """Base error for administrator account operations."""


class AccountAlreadyExistsError(AccountManagementError):
    """Raised when an account login name is already in use."""


class AccountPermissionError(AccountManagementError):
    """Raised when an account operation is attempted by a non-administrator."""


class AccountNotFoundError(AccountManagementError):
    """Raised when an administrator targets a missing account."""


class InvalidAccountStateError(AccountManagementError):
    """Raised when an account state transition is not allowed."""


class LastAdministratorError(AccountManagementError):
    """Raised when an operation would remove the final administrator."""


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

    @staticmethod
    async def _load_account(db_session: AsyncSession, account_id: int) -> Account:
        account = await db_session.scalar(
            select(Account)
            .options(selectinload(Account.profile))
            .where(Account.account_id == account_id)
        )
        if account is None:
            raise AccountNotFoundError("Account not found")
        return account

    @staticmethod
    async def _count_administrators(db_session: AsyncSession) -> int:
        count = await db_session.scalar(
            select(func.count())
            .select_from(Account)
            .where(Account.role == AccountRole.ADMINISTRATOR)
        )
        return int(count or 0)

    async def _ensure_not_last_administrator(
        self,
        db_session: AsyncSession,
        account: Account,
    ) -> None:
        if (
            account.role is AccountRole.ADMINISTRATOR
            and await self._count_administrators(db_session) <= 1
        ):
            raise LastAdministratorError("The final administrator cannot be removed")

    @staticmethod
    async def _revoke_active_sessions(
        db_session: AsyncSession,
        account_id: int,
        now: datetime,
    ) -> None:
        await db_session.execute(
            update(AccountSession)
            .where(
                AccountSession.account_id == account_id,
                AccountSession.revoked_at.is_(None),
            )
            .values(revoked_at=now)
        )

    @staticmethod
    def _add_audit_log(
        db_session: AsyncSession,
        administrator: Account,
        action: str,
        target: Account,
        before_state: dict[str, object],
        after_state: dict[str, object],
    ) -> None:
        db_session.add(
            AdminAuditLog(
                administrator_account_id=administrator.account_id,
                action=action,
                target_account_id=target.account_id,
                before_state=before_state,
                after_state=after_state,
            )
        )

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
            profile=Profile(
                display_name=display_name or login_name,
                avatar_text=display_name or login_name,
                avatar_background_color=DEFAULT_AVATAR_BACKGROUND_COLOR,
            ),
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
        return account

    async def disable_account(
        self,
        db_session: AsyncSession,
        administrator: Account,
        account_id: int,
        now: datetime | None = None,
    ) -> Account:
        self._require_administrator(administrator)
        account = await self._load_account(db_session, account_id)
        if account.status is AccountStatus.DELETED:
            raise InvalidAccountStateError("Deleted accounts cannot be disabled")
        if account.status is AccountStatus.DISABLED:
            return account

        await self._ensure_not_last_administrator(db_session, account)
        before_state = account_snapshot(account)
        current_time = now or datetime.now(UTC)
        account.status = AccountStatus.DISABLED
        await self._revoke_active_sessions(db_session, account.account_id, current_time)
        self._add_audit_log(
            db_session,
            administrator,
            "account_disabled",
            account,
            before_state,
            account_snapshot(account),
        )
        await db_session.commit()
        return account

    async def restore_account(
        self,
        db_session: AsyncSession,
        administrator: Account,
        account_id: int,
    ) -> Account:
        self._require_administrator(administrator)
        account = await self._load_account(db_session, account_id)
        if account.status is AccountStatus.DELETED:
            raise InvalidAccountStateError("Deleted accounts cannot be restored")
        if account.status is AccountStatus.ACTIVE:
            return account

        before_state = account_snapshot(account)
        account.status = AccountStatus.ACTIVE
        self._add_audit_log(
            db_session,
            administrator,
            "account_restored",
            account,
            before_state,
            account_snapshot(account),
        )
        await db_session.commit()
        return account

    async def soft_delete_account(
        self,
        db_session: AsyncSession,
        administrator: Account,
        account_id: int,
        now: datetime | None = None,
    ) -> Account:
        self._require_administrator(administrator)
        account = await self._load_account(db_session, account_id)
        if account.status is AccountStatus.DELETED:
            return account

        await self._ensure_not_last_administrator(db_session, account)
        before_state = account_snapshot(account)
        current_time = now or datetime.now(UTC)
        account.status = AccountStatus.DELETED
        await self._revoke_active_sessions(db_session, account.account_id, current_time)
        self._add_audit_log(
            db_session,
            administrator,
            "account_deleted",
            account,
            before_state,
            account_snapshot(account),
        )
        await db_session.commit()
        return account

    async def update_role(
        self,
        db_session: AsyncSession,
        administrator: Account,
        account_id: int,
        role: AccountRole,
    ) -> Account:
        self._require_administrator(administrator)
        account = await self._load_account(db_session, account_id)
        if account.status is AccountStatus.DELETED:
            raise InvalidAccountStateError("Deleted accounts cannot change roles")
        if account.role is role:
            return account

        if account.role is AccountRole.ADMINISTRATOR and role is AccountRole.PLAYER:
            await self._ensure_not_last_administrator(db_session, account)

        before_state = account_snapshot(account)
        account.role = role
        self._add_audit_log(
            db_session,
            administrator,
            "account_role_updated",
            account,
            before_state,
            account_snapshot(account),
        )
        await db_session.commit()
        return account

    async def reset_password(
        self,
        db_session: AsyncSession,
        administrator: Account,
        account_id: int,
        password: str,
        now: datetime | None = None,
    ) -> Account:
        self._require_administrator(administrator)
        if not password:
            raise AccountManagementError("Password is required")

        account = await self._load_account(db_session, account_id)
        if account.status is AccountStatus.DELETED:
            raise InvalidAccountStateError("Deleted accounts cannot reset passwords")

        before_state = account_snapshot(account)
        current_time = now or datetime.now(UTC)
        account.password_hash = self._password_service.hash(password)
        await self._revoke_active_sessions(db_session, account.account_id, current_time)
        after_state = account_snapshot(account)
        after_state["password_reset"] = True
        self._add_audit_log(
            db_session,
            administrator,
            "account_password_reset",
            account,
            before_state,
            after_state,
        )
        await db_session.commit()
        return account
