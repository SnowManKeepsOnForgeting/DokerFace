"""Create public room chat message history.

Revision ID: 0007_create_chat_messages
Revises: 0006_create_ratings
Create Date: 2026-07-16
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007_create_chat_messages"
down_revision: str | None = "0006_create_ratings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "chat_messages",
        sa.Column("message_id", sa.Uuid(), nullable=False),
        sa.Column("room_id", sa.Uuid(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("message_type", sa.String(length=24), nullable=False),
        sa.Column("content", sa.String(length=500), nullable=False),
        sa.Column("target_account_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.account_id"],
            name="fk_chat_messages_account_id_accounts",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["room_id"],
            ["rooms.room_id"],
            name="fk_chat_messages_room_id_rooms",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["target_account_id"],
            ["accounts.account_id"],
            name="fk_chat_messages_target_account_id_accounts",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("message_id", name="pk_chat_messages"),
    )
    op.create_index(
        "ix_chat_messages_room_id_created_at",
        "chat_messages",
        ["room_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_chat_messages_room_id_created_at", table_name="chat_messages")
    op.drop_table("chat_messages")
