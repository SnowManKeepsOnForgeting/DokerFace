"""Create rating batches and multiplayer rating records.

Revision ID: 0006_create_ratings
Revises: 0005_create_match_history
Create Date: 2026-07-16
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_create_ratings"
down_revision: str | None = "0005_create_match_history"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "rating_batches",
        sa.Column("batch_id", sa.Uuid(), nullable=False),
        sa.Column("created_by_account_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["created_by_account_id"],
            ["accounts.account_id"],
            name="fk_rating_batches_created_by_account_id_accounts",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("batch_id", name="pk_rating_batches"),
    )
    op.create_index("ix_rating_batches_created_at", "rating_batches", ["created_at"])

    op.create_table(
        "ratings",
        sa.Column("batch_id", sa.Uuid(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("rating", sa.Numeric(12, 4), server_default=sa.text("1000.0000"), nullable=False),
        sa.Column(
            "highest_rating",
            sa.Numeric(12, 4),
            server_default=sa.text("1000.0000"),
            nullable=False,
        ),
        sa.Column("completed_matches", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.account_id"],
            name="fk_ratings_account_id_accounts",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["batch_id"],
            ["rating_batches.batch_id"],
            name="fk_ratings_batch_id_rating_batches",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("batch_id", "account_id", name="pk_ratings"),
    )
    op.create_index("ix_ratings_account_id", "ratings", ["account_id"])

    op.create_table(
        "rating_changes",
        sa.Column("rating_change_id", sa.Uuid(), nullable=False),
        sa.Column("batch_id", sa.Uuid(), nullable=False),
        sa.Column("match_id", sa.Uuid(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("before_rating", sa.Numeric(12, 4), nullable=False),
        sa.Column("delta", sa.Numeric(12, 4), nullable=False),
        sa.Column("after_rating", sa.Numeric(12, 4), nullable=False),
        sa.Column("finishing_rank", sa.SmallInteger(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.account_id"],
            name="fk_rating_changes_account_id_accounts",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["batch_id"],
            ["rating_batches.batch_id"],
            name="fk_rating_changes_batch_id_rating_batches",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["match_id"],
            ["matches.match_id"],
            name="fk_rating_changes_match_id_matches",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("rating_change_id", name="pk_rating_changes"),
        sa.UniqueConstraint(
            "batch_id",
            "match_id",
            "account_id",
            name="uq_rating_changes_batch_match_account",
        ),
    )
    op.create_index(
        "ix_rating_changes_account_id_created_at",
        "rating_changes",
        ["account_id", "created_at"],
    )
    op.create_index("ix_rating_changes_match_id", "rating_changes", ["match_id"])


def downgrade() -> None:
    op.drop_index("ix_rating_changes_match_id", table_name="rating_changes")
    op.drop_index("ix_rating_changes_account_id_created_at", table_name="rating_changes")
    op.drop_table("rating_changes")
    op.drop_index("ix_ratings_account_id", table_name="ratings")
    op.drop_table("ratings")
    op.drop_index("ix_rating_batches_created_at", table_name="rating_batches")
    op.drop_table("rating_batches")
