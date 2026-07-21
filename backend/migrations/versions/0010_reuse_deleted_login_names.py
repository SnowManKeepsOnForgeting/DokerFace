"""Allow deleted account login names to be reused.

Revision ID: 0010_reuse_deleted_login_names
Revises: 0009_add_matches_played_to_stats
Create Date: 2026-07-22
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010_reuse_deleted_login_names"
down_revision: str | None = "0009_add_matches_played_to_stats"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("uq_accounts_login_name", table_name="accounts", type_="unique")
    op.create_index(
        "uq_accounts_login_name_non_deleted",
        "accounts",
        ["login_name"],
        unique=True,
        postgresql_where=sa.text("status IN ('active', 'disabled')"),
    )


def downgrade() -> None:
    op.drop_index("uq_accounts_login_name_non_deleted", table_name="accounts")
    op.create_unique_constraint("uq_accounts_login_name", "accounts", ["login_name"])
