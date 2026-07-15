# pyright: reportMissingTypeStubs=false

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload
from testcontainers.postgres import PostgresContainer

from app.accounts.models import Account, AccountRole, AccountSession, AccountStatus, Profile

BACKEND_DIR = Path(__file__).resolve().parents[1]
pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
async def postgres_database_url() -> AsyncIterator[str]:
    try:
        container = PostgresContainer("postgres:17-alpine", driver="asyncpg")
        await asyncio.to_thread(container.start)
    except Exception as exc:
        pytest.skip(f"PostgreSQL integration tests require Docker: {exc}")

    database_url = container.get_connection_url(driver="asyncpg")
    alembic_config = Config(str(BACKEND_DIR / "alembic.ini"))
    alembic_config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))

    try:
        await asyncio.to_thread(command.upgrade, alembic_config, "head")
    except Exception:
        await asyncio.to_thread(container.stop)
        raise

    try:
        yield database_url
    finally:
        await asyncio.to_thread(container.stop)


async def test_account_schema_enforces_identity_uniqueness_and_relationships(
    postgres_database_url: str,
) -> None:
    engine = create_async_engine(postgres_database_url, pool_pre_ping=True)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    try:
        async with session_factory() as session:
            player = Account(
                login_name="alice",
                password_hash="argon2-hash",
                profile=Profile(display_name="Alice"),
            )
            administrator = Account(
                login_name="admin",
                password_hash="another-argon2-hash",
                role=AccountRole.ADMINISTRATOR,
                status=AccountStatus.DISABLED,
                profile=Profile(display_name="Administrator"),
            )
            session.add_all([player, administrator])
            await session.commit()

            assert player.account_id == 1
            assert administrator.account_id == 2

            player_session = AccountSession(
                account=player,
                token_hash="a" * 64,
                expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
            session.add(player_session)
            await session.commit()

            loaded_player = await session.scalar(
                select(Account)
                .options(selectinload(Account.profile), selectinload(Account.sessions))
                .where(Account.login_name == "alice")
            )
            assert loaded_player is not None
            assert loaded_player.profile is not None
            assert loaded_player.profile.display_name == "Alice"
            assert loaded_player.sessions[0].token_hash == "a" * 64

            duplicate = Account(
                login_name="alice",
                password_hash="duplicate-hash",
                profile=Profile(display_name="Duplicate"),
            )
            session.add(duplicate)
            with pytest.raises(IntegrityError):
                await session.commit()
            await session.rollback()
    finally:
        await engine.dispose()
