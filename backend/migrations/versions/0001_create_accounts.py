"""Create accounts, profiles, and sessions.

Revision ID: 0001_create_accounts
Revises:
Create Date: 2026-07-15
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001_create_accounts"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    account_role = sa.Enum("player", "administrator", name="account_role")
    account_status = sa.Enum("active", "disabled", "deleted", name="account_status")

    op.create_table(
        "accounts",
        sa.Column(
            "account_id",
            sa.Integer(),
            sa.Identity(start=1, increment=1),
            nullable=False,
        ),
        sa.Column("login_name", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column(
            "role",
            account_role,
            server_default=sa.text("'player'"),
            nullable=False,
        ),
        sa.Column(
            "status",
            account_status,
            server_default=sa.text("'active'"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("account_id", name="pk_accounts"),
        sa.UniqueConstraint("login_name", name="uq_accounts_login_name"),
    )

    op.create_table(
        "profiles",
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("avatar_path", sa.String(), nullable=True),
        sa.Column(
            "rank_badge_theme",
            sa.String(),
            server_default=sa.text("'default'"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.account_id"],
            name="fk_profiles_account_id_accounts",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("account_id", name="pk_profiles"),
    )

    op.create_table(
        "sessions",
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "last_activity_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.account_id"],
            name="fk_sessions_account_id_accounts",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("session_id", name="pk_sessions"),
        sa.UniqueConstraint("token_hash", name="uq_sessions_token_hash"),
    )
    op.create_index("ix_sessions_account_id", "sessions", ["account_id"])
    op.create_index("ix_sessions_expires_at", "sessions", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_sessions_expires_at", table_name="sessions")
    op.drop_index("ix_sessions_account_id", table_name="sessions")
    op.drop_table("sessions")
    op.drop_table("profiles")
    op.drop_table("accounts")

    bind = op.get_bind()
    sa.Enum("active", "disabled", "deleted", name="account_status").drop(
        bind,
        checkfirst=True,
    )
    sa.Enum("player", "administrator", name="account_role").drop(bind, checkfirst=True)
