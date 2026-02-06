"""user roles

Revision ID: 0010_user_roles
Revises: 0009_tx_refunds
Create Date: 2026-02-06

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0010_user_roles"
down_revision = "0009_tx_refunds"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add role with default 'user' for new rows.
    op.add_column(
        "users",
        sa.Column(
            "role",
            sa.String(length=10),
            nullable=False,
            server_default=sa.text("'user'"),
        ),
    )

    # Backfill existing rows to admin so existing deployments keep working.
    op.execute("UPDATE users SET role='admin' WHERE role='user' OR role IS NULL")


def downgrade() -> None:
    op.drop_column("users", "role")
