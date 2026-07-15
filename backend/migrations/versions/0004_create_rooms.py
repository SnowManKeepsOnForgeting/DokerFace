"""Create persistent room configurations.

Revision ID: 0004_create_rooms
Revises: 0003_profile_avatars
Create Date: 2026-07-16
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004_create_rooms"
down_revision: str | None = "0003_profile_avatars"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    room_visibility = sa.Enum("public", "password", "invite", name="room_visibility")
    room_status = sa.Enum("waiting", "active", "closed", name="room_status")

    op.create_table(
        "rooms",
        sa.Column("room_id", sa.Uuid(), nullable=False),
        sa.Column("host_account_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("visibility", room_visibility, nullable=False),
        sa.Column("password_hash", sa.String(), nullable=True),
        sa.Column(
            "rules",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column(
            "status",
            room_status,
            server_default=sa.text("'waiting'"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "length(btrim(name)) > 0",
            name="ck_rooms_name_not_blank",
        ),
        sa.ForeignKeyConstraint(
            ["host_account_id"],
            ["accounts.account_id"],
            name="fk_rooms_host_account_id_accounts",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("room_id", name="pk_rooms"),
    )
    op.create_index("ix_rooms_host_account_id", "rooms", ["host_account_id"])
    op.create_index("ix_rooms_status", "rooms", ["status"])


def downgrade() -> None:
    op.drop_index("ix_rooms_status", table_name="rooms")
    op.drop_index("ix_rooms_host_account_id", table_name="rooms")
    op.drop_table("rooms")

    bind = op.get_bind()
    sa.Enum("closed", "active", "waiting", name="room_status").drop(
        bind,
        checkfirst=True,
    )
    sa.Enum("invite", "password", "public", name="room_visibility").drop(
        bind,
        checkfirst=True,
    )
