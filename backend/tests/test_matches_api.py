from collections.abc import AsyncIterator
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Account, AccountRole, AccountStatus
from app.auth.dependencies import get_current_account
from app.config import Settings
from app.db.dependencies import get_db_session
from app.main import create_app
from app.matches.models import (
    ActionRecord,
    HandPlayerRecord,
    HandRecord,
    MatchPlayerRecord,
    MatchRecord,
    PotRecord,
)


def make_account(account_id: int) -> Account:
    return Account(
        account_id=account_id,
        login_name=f"player-{account_id}",
        password_hash="stored-hash",
        role=AccountRole.PLAYER,
        status=AccountStatus.ACTIVE,
    )


def build_app(session: AsyncSession, account: Account) -> FastAPI:
    app = create_app(Settings(database_url="sqlite+aiosqlite:///:memory:"))

    async def override_db_session() -> AsyncIterator[AsyncSession]:
        yield session

    async def override_current_account() -> Account:
        return account

    app.dependency_overrides[get_db_session] = override_db_session
    app.dependency_overrides[get_current_account] = override_current_account
    return app


def make_history() -> tuple[MatchRecord, HandRecord]:
    match_id = uuid4()
    hand_id = uuid4()
    started_at = datetime(2026, 7, 16, 12, 0, tzinfo=UTC)
    players = [
        MatchPlayerRecord(
            match_id=match_id,
            account_id=1,
            seat=0,
            display_name="Alice",
            initial_chips=1000,
            final_chips=1200,
            finishing_rank=1,
        ),
        MatchPlayerRecord(
            match_id=match_id,
            account_id=2,
            seat=1,
            display_name="Bob",
            initial_chips=1000,
            final_chips=800,
            finishing_rank=2,
        ),
        MatchPlayerRecord(
            match_id=match_id,
            account_id=3,
            seat=2,
            display_name="Cara",
            initial_chips=1000,
            final_chips=1000,
            finishing_rank=2,
        ),
    ]
    hand = HandRecord(
        hand_id=hand_id,
        match_id=match_id,
        hand_number=1,
        button_account_id=1,
        small_blind=50,
        big_blind=100,
        status="settled",
        public_board=["Ah", "Kd", "Qc"],
        settlement_summary={"payoffs": [200, -100, -100]},
        started_at=started_at,
        settled_at=started_at,
        players=[
            HandPlayerRecord(
                hand_id=hand_id,
                account_id=1,
                hole_cards=["As", "Ad"],
                folded=False,
                all_in=False,
                shown=False,
                invested_chips=100,
                won_chips=200,
            ),
            HandPlayerRecord(
                hand_id=hand_id,
                account_id=2,
                hole_cards=["2s", "2d"],
                all_in=False,
                shown=False,
                folded=True,
                invested_chips=100,
                won_chips=0,
            ),
            HandPlayerRecord(
                hand_id=hand_id,
                account_id=3,
                hole_cards=["Jh", "Jc"],
                folded=False,
                all_in=False,
                shown=True,
                invested_chips=100,
                won_chips=0,
            ),
        ],
        actions=[
            ActionRecord(
                hand_id=hand_id,
                sequence_no=1,
                state_version=1,
                account_id=2,
                street="preflop",
                action="fold",
                amount=None,
                created_at=started_at,
            )
        ],
        pots=[
            PotRecord(
                hand_id=hand_id,
                pot_number=1,
                amount=300,
                eligible_account_ids=[1, 2, 3],
                winner_payouts={"1": 300},
            )
        ],
    )
    match = MatchRecord(
        match_id=match_id,
        room_id=uuid4(),
        rules_snapshot={"starting_chips": 1000},
        end_mode="fixed_hands",
        status="complete",
        started_at=started_at,
        completed_at=started_at,
        players=players,
        hands=[hand],
    )
    return match, hand


@pytest.mark.asyncio
async def test_player_match_list_returns_paginated_match_summaries() -> None:
    session = AsyncMock(spec=AsyncSession)
    match, _ = make_history()
    result = MagicMock()
    result.all.return_value = [match]
    session.scalar.return_value = 1
    session.scalars.return_value = result
    app = build_app(session, make_account(1))

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/players/1/matches?offset=0&limit=10")

    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["players"][0]["display_name"] == "Alice"


@pytest.mark.asyncio
async def test_match_and_hand_history_hide_unshown_hole_cards() -> None:
    session = AsyncMock(spec=AsyncSession)
    match, hand = make_history()
    session.scalar.return_value = match
    app = build_app(session, make_account(1))

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        match_response = await client.get(f"/api/v1/matches/{match.match_id}")
        session.scalar.return_value = hand
        hand_response = await client.get(f"/api/v1/hands/{hand.hand_id}")

    assert match_response.status_code == 200
    match_players = {
        player["account_id"]: player for player in match_response.json()["hands"][0]["players"]
    }
    assert match_players[1]["hole_cards"] == ["As", "Ad"]
    assert match_players[2]["hole_cards"] is None
    assert match_players[3]["hole_cards"] == ["Jh", "Jc"]
    assert hand_response.status_code == 200
    assert hand_response.json()["actions"][0]["state_version"] == 1
    assert hand_response.json()["pots"][0]["winner_payouts"] == {"1": 300}


@pytest.mark.asyncio
async def test_history_endpoints_validate_pagination_and_missing_records() -> None:
    session = AsyncMock(spec=AsyncSession)
    session.scalar.return_value = None
    app = build_app(session, make_account(1))

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        invalid = await client.get("/api/v1/players/1/matches?offset=-1")
        missing = await client.get(f"/api/v1/matches/{uuid4()}")

    assert invalid.status_code == 400
    assert missing.status_code == 404
