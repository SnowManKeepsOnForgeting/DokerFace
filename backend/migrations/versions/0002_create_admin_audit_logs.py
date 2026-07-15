"""Create administrator audit logs.

Revision ID: 0002_create_admin_audit_logs
Revises: 0001_create_accounts
Create Date: 2026-07-16
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_create_admin_audit_logs"
down_revision: str | None = "0001_create_accounts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "admin_audit_logs",
        sa.Column("audit_log_id", sa.Uuid(), nullable=False),
        sa.Column("administrator_account_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("target_account_id", sa.Integer(), nullable=True),
        sa.Column("before_state", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("after_state", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["administrator_account_id"],
            ["accounts.account_id"],
            name="fk_admin_audit_logs_administrator_account_id_accounts",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["target_account_id"],
            ["accounts.account_id"],
            name="fk_admin_audit_logs_target_account_id_accounts",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("audit_log_id", name="pk_admin_audit_logs"),
    )
    op.create_index(
        "ix_admin_audit_logs_administrator_account_id",
        "admin_audit_logs",
        ["administrator_account_id"],
    )
    op.create_index(
        "ix_admin_audit_logs_target_account_id",
        "admin_audit_logs",
        ["target_account_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_admin_audit_logs_target_account_id",
        table_name="admin_audit_logs",
    )
    op.drop_index(
        "ix_admin_audit_logs_administrator_account_id",
        table_name="admin_audit_logs",
    )
    op.drop_table("admin_audit_logs")
