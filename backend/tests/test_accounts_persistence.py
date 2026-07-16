# pyright: reportMissingTypeStubs=false

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload
from testcontainers.postgres import PostgresContainer

from app.accounts.models import Account, AccountRole, AccountSession, AccountStatus, Profile
from app.admin.models import AdminAuditLog
from app.rooms.config import MatchEndMode, RoomRules, RoomVisibility
from app.rooms.models import Room, RoomStatus

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
