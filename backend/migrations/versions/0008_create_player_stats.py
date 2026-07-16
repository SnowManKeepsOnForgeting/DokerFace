"""Create persistent player statistics counters.

Revision ID: 0008_create_player_stats
Revises: 0007_create_chat_messages
Create Date: 2026-07-16
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008_create_player_stats"
down_revision: str | None = "0007_create_chat_messages"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    integer_columns = (
        "dealt_hands",
        "won_hands",
        "profitable_matches",
        "vpip_opportunities",
        "vpip",
        "pfr_opportunities",
        "pfr",
        "three_bet_opportunities",
        "three_bets",
        "showdown_opportunities",
        "showdowns",
        "showdown_wins",
        "decisions",
        "folds",
        "all_ins",
        "pot_count",
    )
    columns = [
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("reducer_version", sa.Integer(), nullable=False),
        *[
            sa.Column(column, sa.Integer(), server_default=sa.text("0"), nullable=False)
            for column in integer_columns
        ],
        sa.Column("pot_total", sa.BigInteger(), server_default=sa.text("0"), nullable=False),
        sa.Column(
            "position_counts",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    ]
    op.create_table(
        "player_stats",
        *columns,
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.account_id"],
            name="fk_player_stats_account_id_accounts",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("account_id", name="pk_player_stats"),
    )


def downgrade() -> None:
    op.drop_table("player_stats")
