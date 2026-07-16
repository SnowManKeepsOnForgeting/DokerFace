"""Create auditable match and hand history tables.

Revision ID: 0005_create_match_history
Revises: 0004_create_rooms
Create Date: 2026-07-16
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005_create_match_history"
down_revision: str | None = "0004_create_rooms"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "matches",
        sa.Column("match_id", sa.Uuid(), nullable=False),
        sa.Column("room_id", sa.Uuid(), nullable=False),
        sa.Column(
            "rules_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column("end_mode", sa.String(length=32), nullable=False),
        sa.Column(
            "status",
            sa.String(length=16),
            server_default=sa.text("'active'"),
            nullable=False,
        ),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("void_reason", sa.String(), nullable=True),
        sa.CheckConstraint(
            "status IN ('active', 'complete', 'void')",
            name="ck_matches_status_values",
        ),
        sa.ForeignKeyConstraint(
            ["room_id"],
            ["rooms.room_id"],
            name="fk_matches_room_id_rooms",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("match_id", name="pk_matches"),
    )
    op.create_index("ix_matches_room_id", "matches", ["room_id"])
    op.create_index("ix_matches_status_started_at", "matches", ["status", "started_at"])

    op.create_table(
        "match_players",
        sa.Column("match_id", sa.Uuid(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("seat", sa.SmallInteger(), nullable=False),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("initial_chips", sa.BigInteger(), nullable=False),
        sa.Column("final_chips", sa.BigInteger(), nullable=True),
        sa.Column("finishing_rank", sa.SmallInteger(), nullable=True),
        sa.Column("exit_reason", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.account_id"],
            name="fk_match_players_account_id_accounts",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["match_id"],
            ["matches.match_id"],
            name="fk_match_players_match_id_matches",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("match_id", "account_id", name="pk_match_players"),
        sa.UniqueConstraint("match_id", "seat", name="uq_match_players_match_id_seat"),
    )
    op.create_index("ix_match_players_account_id", "match_players", ["account_id"])

    op.create_table(
        "hands",
        sa.Column("hand_id", sa.Uuid(), nullable=False),
        sa.Column("match_id", sa.Uuid(), nullable=False),
        sa.Column("hand_number", sa.Integer(), nullable=False),
        sa.Column("button_account_id", sa.Integer(), nullable=False),
        sa.Column("small_blind", sa.BigInteger(), nullable=False),
        sa.Column("big_blind", sa.BigInteger(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column(
            "public_board",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "settlement_summary",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("settled_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('active', 'settled', 'void')",
            name="ck_hands_status_values",
        ),
        sa.ForeignKeyConstraint(
            ["button_account_id"],
            ["accounts.account_id"],
            name="fk_hands_button_account_id_accounts",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["match_id"],
            ["matches.match_id"],
            name="fk_hands_match_id_matches",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("hand_id", name="pk_hands"),
        sa.UniqueConstraint("match_id", "hand_number", name="uq_hands_match_id_hand_number"),
    )
    op.create_index("ix_hands_match_id", "hands", ["match_id"])

    op.create_table(
        "hand_players",
        sa.Column("hand_id", sa.Uuid(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("hole_cards", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("folded", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("all_in", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("shown", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("invested_chips", sa.BigInteger(), server_default=sa.text("0"), nullable=False),
        sa.Column("won_chips", sa.BigInteger(), server_default=sa.text("0"), nullable=False),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.account_id"],
            name="fk_hand_players_account_id_accounts",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["hand_id"],
            ["hands.hand_id"],
            name="fk_hand_players_hand_id_hands",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("hand_id", "account_id", name="pk_hand_players"),
    )
    op.create_index("ix_hand_players_account_id", "hand_players", ["account_id"])

    op.create_table(
        "actions",
        sa.Column("action_id", sa.Uuid(), nullable=False),
        sa.Column("hand_id", sa.Uuid(), nullable=False),
        sa.Column("sequence_no", sa.Integer(), nullable=False),
        sa.Column("state_version", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("street", sa.String(length=16), nullable=False),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("amount", sa.BigInteger(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.account_id"],
            name="fk_actions_account_id_accounts",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["hand_id"],
            ["hands.hand_id"],
            name="fk_actions_hand_id_hands",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("action_id", name="pk_actions"),
        sa.UniqueConstraint("hand_id", "sequence_no", name="uq_actions_hand_id_sequence_no"),
    )
    op.create_index("ix_actions_hand_id", "actions", ["hand_id"])
    op.create_index("ix_actions_account_id", "actions", ["account_id"])

    op.create_table(
        "pots",
        sa.Column("pot_id", sa.Uuid(), nullable=False),
        sa.Column("hand_id", sa.Uuid(), nullable=False),
        sa.Column("pot_number", sa.SmallInteger(), nullable=False),
        sa.Column("amount", sa.BigInteger(), nullable=False),
        sa.Column(
            "eligible_account_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column(
            "winner_payouts",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["hand_id"],
            ["hands.hand_id"],
            name="fk_pots_hand_id_hands",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("pot_id", name="pk_pots"),
        sa.UniqueConstraint("hand_id", "pot_number", name="uq_pots_hand_id_pot_number"),
    )
    op.create_index("ix_pots_hand_id", "pots", ["hand_id"])


def downgrade() -> None:
    op.drop_index("ix_pots_hand_id", table_name="pots")
    op.drop_table("pots")
    op.drop_index("ix_actions_account_id", table_name="actions")
    op.drop_index("ix_actions_hand_id", table_name="actions")
    op.drop_table("actions")
    op.drop_index("ix_hand_players_account_id", table_name="hand_players")
    op.drop_table("hand_players")
    op.drop_index("ix_hands_match_id", table_name="hands")
    op.drop_table("hands")
    op.drop_index("ix_match_players_account_id", table_name="match_players")
    op.drop_table("match_players")
    op.drop_index("ix_matches_status_started_at", table_name="matches")
    op.drop_index("ix_matches_room_id", table_name="matches")
    op.drop_table("matches")
