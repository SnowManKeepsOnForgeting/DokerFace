"""Define text and emoji avatar profiles.

Revision ID: 0003_profile_avatars
Revises: 0002_create_admin_audit_logs
Create Date: 2026-07-16
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_profile_avatars"
down_revision: str | None = "0002_create_admin_audit_logs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEFAULT_AVATAR_BACKGROUND_COLOR = "#64748B"


def upgrade() -> None:
    op.add_column(
        "profiles",
        sa.Column("avatar_text", sa.String(), nullable=True),
    )
    op.add_column(
        "profiles",
        sa.Column(
            "avatar_background_color",
            sa.String(length=7),
            server_default=sa.text(f"'{DEFAULT_AVATAR_BACKGROUND_COLOR}'"),
            nullable=True,
        ),
    )
    op.execute(sa.text("UPDATE profiles SET avatar_text = display_name WHERE avatar_text IS NULL"))
    op.execute(
        sa.text(
            "UPDATE profiles SET avatar_background_color = :default_color "
            "WHERE avatar_background_color IS NULL"
        ).bindparams(default_color=DEFAULT_AVATAR_BACKGROUND_COLOR)
    )
    op.alter_column("profiles", "avatar_text", nullable=False)
    op.alter_column("profiles", "avatar_background_color", nullable=False)
    op.drop_column("profiles", "avatar_path")
    op.create_check_constraint(
        "ck_profiles_avatar_text_not_blank",
        "profiles",
        "length(btrim(avatar_text)) > 0",
    )
    op.create_check_constraint(
        "ck_profiles_avatar_background_color_hex",
        "profiles",
        "avatar_background_color ~ '^#[0-9A-Fa-f]{6}$'",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_profiles_avatar_background_color_hex",
        "profiles",
        type_="check",
    )
    op.drop_constraint(
        "ck_profiles_avatar_text_not_blank",
        "profiles",
        type_="check",
    )
    op.add_column("profiles", sa.Column("avatar_path", sa.String(), nullable=True))
    op.drop_column("profiles", "avatar_background_color")
    op.drop_column("profiles", "avatar_text")
