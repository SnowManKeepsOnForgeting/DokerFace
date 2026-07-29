"""Inactive accounts must not appear on the leaderboard or the public list.

Disabled and soft-deleted accounts keep their rating records so a restore is
reversible, so visibility is enforced in the queries. These tests capture the
emitted statements because the project's SQL-level fixtures require PostgreSQL;
the behavioral coverage over real data lives in ``test_accounts_persistence``.
"""

from collections.abc import AsyncIterator, Sequence
from datetime import UTC, datetime
from typing import Any
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account, AccountRole, AccountStatus, Profile
from app.auth.dependencies import get_current_account
from app.config import Settings
from app.db.dependencies import get_db_session
from app.main import create_app
from app.ratings.models import RatingBatch, RatingRecord
from app.ratings.service import RatingService

ACTIVE_ACCOUNT_FILTER = "accounts.status = 'active'"


def make_account(account_id: int, login_name: str) -> Account:
    return Account(
        account_id=account_id,
        login_name=login_name,
        password_hash="stored-hash",
        role=AccountRole.PLAYER,
        status=AccountStatus.ACTIVE,
        profile=Profile(
            display_name=login_name.title(),
            avatar_text=login_name.title(),
            avatar_background_color="#64748B",
            rank_badge_theme="default",
        ),
    )


def compiled_sql(statement: Any) -> str:
    """Render a statement the way PostgreSQL will receive it."""
    return str(
        statement.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    )


class RecordingSession:
    """Minimal async session double that records the statements it receives."""

    def __init__(self, batch: RatingBatch, entries: Sequence[RatingRecord], total: int) -> None:
        self.batch = batch
        self.entries = entries
        self.total = total
        self.statements: list[str] = []

    async def scalar(self, statement: Any, *args: Any, **kwargs: Any) -> Any:
        rendered = compiled_sql(statement)
        self.statements.append(rendered)
        if "count(*)" in rendered:
            return self.total
        if "FROM rating_batches" in rendered:
            return self.batch
        return None

    async def scalars(self, statement: Any, *args: Any, **kwargs: Any) -> Any:
        rendered = compiled_sql(statement)
        self.statements.append(rendered)
        result = MagicMock()
        if "FROM ratings" in rendered:
            result.all.return_value = list(self.entries)
        else:
            result.all.return_value = []
        return result

    def statements_containing(self, needle: str) -> list[str]:
        return [statement for statement in self.statements if needle in statement]


def make_batch_and_entries() -> tuple[RatingBatch, list[RatingRecord]]:
    batch = RatingBatch(
        batch_id=uuid4(),
        created_at=datetime(2026, 7, 29, 12, 0, tzinfo=UTC),
    )
    entries = [
        RatingRecord(
            batch_id=batch.batch_id,
            account_id=1,
            rating=1100,
            highest_rating=1100,
            completed_matches=2,
        ),
        RatingRecord(
            batch_id=batch.batch_id,
            account_id=2,
            rating=1000,
            highest_rating=1000,
            completed_matches=1,
        ),
    ]
    return batch, entries


def build_app(session: Any, current_account: Account) -> FastAPI:
    app = create_app(Settings(database_url="sqlite+aiosqlite:///:memory:"))

    async def override_db_session() -> AsyncIterator[AsyncSession]:
        yield session

    async def override_current_account() -> Account:
        return current_account

    app.dependency_overrides[get_db_session] = override_db_session
    app.dependency_overrides[get_current_account] = override_current_account
    return app


@pytest.mark.asyncio
async def test_leaderboard_entries_and_total_only_count_active_accounts() -> None:
    batch, entries = make_batch_and_entries()
    session = RecordingSession(batch, entries, total=2)

    _, returned, total = await RatingService().leaderboard_entries(
        session,  # type: ignore[arg-type]
        offset=0,
        limit=50,
    )

    assert list(returned) == entries
    assert total == 2
    rating_statements = session.statements_containing("FROM ratings")
    assert len(rating_statements) == 2
    for statement in rating_statements:
        assert "JOIN accounts" in statement
        assert ACTIVE_ACCOUNT_FILTER in statement


@pytest.mark.asyncio
async def test_leaderboard_search_keeps_the_active_account_filter() -> None:
    batch, entries = make_batch_and_entries()
    session = RecordingSession(batch, entries, total=1)

    await RatingService().leaderboard_entries(
        session,  # type: ignore[arg-type]
        offset=0,
        limit=50,
        search="ali",
        rank_filter="B",
        only_with_matches=True,
    )

    rating_statements = session.statements_containing("FROM ratings")
    assert len(rating_statements) == 2
    for statement in rating_statements:
        assert "JOIN accounts" in statement
        assert "JOIN profiles" in statement
        assert ACTIVE_ACCOUNT_FILTER in statement


@pytest.mark.asyncio
async def test_current_player_rank_ignores_inactive_accounts() -> None:
    batch, entries = make_batch_and_entries()
    session = RecordingSession(batch, entries, total=2)

    ranked = await RatingService().ranked_visible_ratings(
        session,  # type: ignore[arg-type]
        batch,
    )

    assert list(ranked) == entries
    ranked_statements = session.statements_containing("FROM ratings")
    assert ranked_statements
    for statement in ranked_statements:
        assert "JOIN accounts" in statement
        assert ACTIVE_ACCOUNT_FILTER in statement


@pytest.mark.asyncio
async def test_leaderboard_response_ranks_visible_players_from_one() -> None:
    batch, entries = make_batch_and_entries()
    session = RecordingSession(batch, entries, total=2)
    current_account = make_account(2, "bob")
    app = build_app(session, current_account)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/leaderboard")

    assert response.status_code == 200
    payload = response.json()
    assert [item["rank"] for item in payload["items"]] == [1, 2]
    assert [item["account_id"] for item in payload["items"]] == [1, 2]
    assert payload["total"] == 2
    # The viewer's rank and gap come from the same filtered set as the list.
    assert payload["current_player_stats"]["rank"] == 2
    assert payload["current_player_stats"]["diff_to_previous_player"] == 100.0


class AccountQuerySession:
    """Async session double that records the account queries it receives."""

    def __init__(self, accounts: Sequence[Account]) -> None:
        self.accounts = accounts
        self.statements: list[str] = []

    async def scalar(self, statement: Any, *args: Any, **kwargs: Any) -> Any:
        rendered = compiled_sql(statement)
        self.statements.append(rendered)
        if "count(*)" in rendered:
            return len(self.accounts)
        return self.accounts[0] if self.accounts else None

    async def scalars(self, statement: Any, *args: Any, **kwargs: Any) -> Any:
        self.statements.append(compiled_sql(statement))
        result = MagicMock()
        result.all.return_value = list(self.accounts)
        return result


@pytest.mark.asyncio
async def test_public_player_list_only_queries_active_accounts() -> None:
    current_account = make_account(1, "alice")
    session = AccountQuerySession([current_account])
    app = build_app(session, current_account)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/players")

    assert response.status_code == 200
    assert [item["account_id"] for item in response.json()["items"]] == [1]
    account_statements = [
        statement for statement in session.statements if "FROM accounts" in statement
    ]
    assert len(account_statements) == 2
    for statement in account_statements:
        assert ACTIVE_ACCOUNT_FILTER in statement


@pytest.mark.asyncio
async def test_public_player_detail_still_serves_disabled_accounts() -> None:
    current_account = make_account(1, "alice")
    session = AccountQuerySession([current_account])
    app = build_app(session, current_account)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.get("/api/v1/players/2")

    detail_statements = [
        statement for statement in session.statements if "FROM accounts" in statement
    ]
    assert detail_statements
    for statement in detail_statements:
        # A disabled account keeps its profile page reachable through history.
        assert "accounts.status != 'deleted'" in statement
        assert ACTIVE_ACCOUNT_FILTER not in statement
