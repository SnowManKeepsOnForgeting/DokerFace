# pyright: reportMissingTypeStubs=false

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload
from testcontainers.postgres import PostgresContainer

from app.accounts.models import Account, AccountRole, AccountSession, AccountStatus, Profile
from app.admin.models import AdminAuditLog
from app.chat.models import ChatMessageRecord
from app.matches.models import (
    ActionRecord,
    HandRecord,
    MatchPlayerRecord,
    MatchRecord,
    PotRecord,
)
from app.matches.persistence import (
    ActionHistory,
    HandHistory,
    HandPlayerHistory,
    MatchHistoryPersistenceService,
    MatchPlayerSeed,
    MatchResult,
    PotHistory,
)
from app.ratings.models import RatingBatch, RatingChangeRecord, RatingRecord
from app.ratings.service import RatingService
from app.rooms.config import MatchEndMode, RoomRules, RoomVisibility
from app.rooms.models import Room, RoomStatus
from app.statistics.models import PlayerStatisticsRecord
from app.statistics.service import StatisticsPersistenceService

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
                profile=Profile(display_name="Alice", avatar_text="Alice"),
            )
            administrator = Account(
                login_name="admin",
                password_hash="another-argon2-hash",
                role=AccountRole.ADMINISTRATOR,
                status=AccountStatus.DISABLED,
                profile=Profile(display_name="Administrator", avatar_text="Administrator"),
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
            assert loaded_player.profile.avatar_text == "Alice"
            assert loaded_player.profile.avatar_background_color == "#64748B"
            assert loaded_player.sessions[0].token_hash == "a" * 64

            audit_log = AdminAuditLog(
                administrator_account_id=administrator.account_id,
                action="create_account",
                target_account_id=player.account_id,
                after_state={"status": "active"},
            )
            session.add(audit_log)
            await session.commit()

            loaded_audit_log = await session.scalar(
                select(AdminAuditLog).where(AdminAuditLog.action == "create_account")
            )
            assert loaded_audit_log is not None
            assert loaded_audit_log.target_account_id == player.account_id
            assert loaded_audit_log.after_state == {"status": "active"}

            room_rules = RoomRules.model_validate(
                {
                    "max_players": 2,
                    "end_mode": MatchEndMode.WINNER_TAKES_ALL,
                    "starting_chips": 1000,
                    "small_blind": 50,
                    "big_blind": 100,
                    "ante": 0,
                    "decision_timeout_seconds": None,
                    "blind_increase_every_hands": 10,
                    "show_remaining_board": False,
                    "winner_may_show_hand": True,
                    "spectators_allowed": False,
                    "auto_start": False,
                    "counted_in_stats": True,
                    "allow_mid_match_join": False,
                    "allow_rebuys": False,
                    "allow_voluntary_leave": False,
                }
            )
            room = Room(
                host_account_id=player.account_id,
                name="Heads Up",
                visibility=RoomVisibility.PUBLIC,
                rules=room_rules.model_dump(mode="json"),
            )
            session.add(room)
            await session.commit()

            loaded_room = await session.scalar(select(Room).where(Room.room_id == room.room_id))
            assert loaded_room is not None
            assert loaded_room.host_account_id == player.account_id
            assert loaded_room.status is RoomStatus.WAITING
            assert loaded_room.rules["decision_timeout_seconds"] is None

            chat_tables = set(
                (
                    await session.execute(
                        text(
                            "SELECT table_name FROM information_schema.tables "
                            "WHERE table_schema = 'public' AND table_name = 'chat_messages'"
                        )
                    )
                ).scalars()
            )
            assert chat_tables == {"chat_messages"}
            chat_message = ChatMessageRecord(
                message_id=uuid.uuid4(),
                room_id=room.room_id,
                account_id=player.account_id,
                message_type="quick",
                content="Nice hand",
            )
            session.add(chat_message)
            await session.commit()
            loaded_chat_message = await session.scalar(
                select(ChatMessageRecord).where(
                    ChatMessageRecord.message_id == chat_message.message_id
                )
            )
            assert loaded_chat_message is not None
            assert loaded_chat_message.content == "Nice hand"

            history_tables = set(
                (
                    await session.execute(
                        text(
                            "SELECT table_name FROM information_schema.tables "
                            "WHERE table_schema = 'public' AND table_name IN "
                            "('matches', 'match_players', 'hands', 'hand_players', "
                            "'actions', 'pots')"
                        )
                    )
                ).scalars()
            )
            assert history_tables == {
                "matches",
                "match_players",
                "hands",
                "hand_players",
                "actions",
                "pots",
            }

            rating_tables = set(
                (
                    await session.execute(
                        text(
                            "SELECT table_name FROM information_schema.tables "
                            "WHERE table_schema = 'public' AND table_name IN "
                            "('rating_batches', 'ratings', 'rating_changes')"
                        )
                    )
                ).scalars()
            )
            assert rating_tables == {"rating_batches", "ratings", "rating_changes"}

            statistics_tables = set(
                (
                    await session.execute(
                        text(
                            "SELECT table_name FROM information_schema.tables "
                            "WHERE table_schema = 'public' AND table_name = 'player_stats'"
                        )
                    )
                ).scalars()
            )
            assert statistics_tables == {"player_stats"}
            statistics_columns = set(
                (
                    await session.execute(
                        text(
                            "SELECT column_name FROM information_schema.columns "
                            "WHERE table_schema = 'public' AND table_name = 'player_stats'"
                        )
                    )
                ).scalars()
            )
            assert "matches_played" in statistics_columns

            unique_constraints = set(
                (
                    await session.execute(
                        text(
                            "SELECT constraint_name FROM information_schema.table_constraints "
                            "WHERE constraint_type = 'UNIQUE' AND table_name IN "
                            "('match_players', 'hands', 'actions', 'pots')"
                        )
                    )
                ).scalars()
            )
            assert {
                "uq_match_players_match_id_seat",
                "uq_hands_match_id_hand_number",
                "uq_actions_hand_id_sequence_no",
                "uq_pots_hand_id_pot_number",
            } <= unique_constraints

            history_service = MatchHistoryPersistenceService()
            match_id = uuid.uuid4()
            hand_id = uuid.uuid4()
            await history_service.create_match(
                session,
                match_id=match_id,
                room_id=room.room_id,
                rules_snapshot=room.rules,
                end_mode="winner_takes_all",
                players=(
                    MatchPlayerSeed(1, 0, "Alice", 1000),
                    MatchPlayerSeed(2, 1, "Administrator", 1000),
                ),
            )
            await history_service.persist_hand(
                session,
                HandHistory(
                    hand_id=hand_id,
                    match_id=match_id,
                    hand_number=1,
                    button_account_id=1,
                    small_blind=50,
                    big_blind=100,
                    public_board=("Ah", "Kd", "Qc"),
                    settlement_summary={"payoffs": [100, -100]},
                    players=(
                        HandPlayerHistory(1, ("As", "Ad"), False, False, True, 100, 200),
                        HandPlayerHistory(2, None, True, False, False, 100, 0),
                    ),
                    actions=(ActionHistory(1, 1, 1, "preflop", "fold", None),),
                    pots=(PotHistory(1, 200, (1, 2), {"1": 200}),),
                ),
            )
            await history_service.complete_match(
                session,
                match_id=match_id,
                results=(
                    MatchResult(1, 1200, 1),
                    MatchResult(2, 800, 2, "busted"),
                ),
            )

            loaded_match = await session.scalar(
                select(MatchRecord).where(MatchRecord.match_id == match_id)
            )
            assert loaded_match is not None
            assert loaded_match.status == "complete"
            loaded_players = list(
                (
                    await session.scalars(
                        select(MatchPlayerRecord).where(MatchPlayerRecord.match_id == match_id)
                    )
                ).all()
            )
            assert {player.final_chips for player in loaded_players} == {1200, 800}
            loaded_hand = await session.scalar(
                select(HandRecord).where(HandRecord.hand_id == hand_id)
            )
            assert loaded_hand is not None
            assert loaded_hand.public_board == ["Ah", "Kd", "Qc"]
            assert (
                await session.scalar(
                    select(ActionRecord.sequence_no).where(ActionRecord.hand_id == hand_id)
                )
                == 1
            )
            assert (
                await session.scalar(select(PotRecord.amount).where(PotRecord.hand_id == hand_id))
                == 200
            )

            totals = await StatisticsPersistenceService().rebuild_from_history(session)
            await session.commit()
            assert totals[1].matches_played == 1
            loaded_statistics = await session.scalar(
                select(PlayerStatisticsRecord).where(PlayerStatisticsRecord.account_id == 1)
            )
            assert loaded_statistics is not None
            assert loaded_statistics.matches_played == 1
            assert loaded_statistics.profitable_matches == 1

            void_match_id = uuid.uuid4()
            await history_service.create_match(
                session,
                match_id=void_match_id,
                room_id=room.room_id,
                rules_snapshot=room.rules,
                end_mode="winner_takes_all",
                players=(
                    MatchPlayerSeed(1, 0, "Alice", 1000),
                    MatchPlayerSeed(2, 1, "Administrator", 1000),
                ),
            )
            assert (
                await history_service.void_active_matches(session, reason="startup_recovery") == 1
            )
            void_match = await session.scalar(
                select(MatchRecord).where(MatchRecord.match_id == void_match_id)
            )
            assert void_match is not None
            assert void_match.status == "void"

            batch = RatingBatch(created_by_account_id=administrator.account_id)
            session.add(batch)
            await session.flush()
            session.add_all(
                [
                    RatingRecord(batch_id=batch.batch_id, account_id=1),
                    RatingRecord(batch_id=batch.batch_id, account_id=2),
                    RatingChangeRecord(
                        batch_id=batch.batch_id,
                        match_id=match_id,
                        account_id=1,
                        before_rating=1000,
                        delta=20,
                        after_rating=1020,
                        finishing_rank=1,
                    ),
                ]
            )
            await session.commit()
            loaded_rating = await session.scalar(
                select(RatingRecord).where(
                    RatingRecord.batch_id == batch.batch_id,
                    RatingRecord.account_id == 1,
                )
            )
            assert loaded_rating is not None
            assert loaded_rating.rating == 1000
            await RatingService().rebuild_current_batch(session)
            await session.commit()
            assert (
                await session.scalar(
                    select(func.count(RatingChangeRecord.rating_change_id)).where(
                        RatingChangeRecord.batch_id == batch.batch_id
                    )
                )
                == 0
            )

            duplicate = Account(
                login_name="alice",
                password_hash="duplicate-hash",
                profile=Profile(display_name="Duplicate", avatar_text="Duplicate"),
            )
            session.add(duplicate)
            with pytest.raises(IntegrityError):
                await session.commit()
            await session.rollback()
    finally:
        await engine.dispose()
