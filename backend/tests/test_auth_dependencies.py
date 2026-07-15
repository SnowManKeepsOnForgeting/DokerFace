import pytest
from fastapi import HTTPException

from app.accounts.models import Account, AccountRole
from app.auth.dependencies import require_administrator


async def test_require_administrator_accepts_administrator() -> None:
    account = Account(
        account_id=1,
        login_name="admin",
        password_hash="stored-hash",
        role=AccountRole.ADMINISTRATOR,
    )

    assert await require_administrator(account) is account


async def test_require_administrator_rejects_player() -> None:
    account = Account(
        account_id=2,
        login_name="player",
        password_hash="stored-hash",
        role=AccountRole.PLAYER,
    )

    with pytest.raises(HTTPException) as exception_info:
        await require_administrator(account)

    assert exception_info.value.status_code == 403
