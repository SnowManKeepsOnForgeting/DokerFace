"""Store completed match count in player statistics.

Revision ID: 0009_add_matches_played_to_stats
Revises: 0008_create_player_stats
Create Date: 2026-07-16
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009_add_matches_played_to_stats"
down_revision: str | None = "0008_create_player_stats"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "player_stats",
        sa.Column("matches_played", sa.Integer(), server_default=sa.text("0"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("player_stats", "matches_played")
