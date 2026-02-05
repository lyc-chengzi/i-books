"""transaction created_at

Revision ID: 0008_tx_created_at
Revises: 0007_transfer
Create Date: 2026-02-04

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0008_tx_created_at"
down_revision = "0007_transfer"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=True,
            server_default=sa.text("SYSUTCDATETIME()"),
        ),
    )

    # Backfill existing rows (best-effort: reuse occurred_at)
    op.execute("UPDATE transactions SET created_at = occurred_at WHERE created_at IS NULL")

    op.alter_column(
        "transactions",
        "created_at",
        existing_type=sa.DateTime(),
        nullable=False,
    )

    op.create_index("ix_transactions_created_at", "transactions", ["created_at"], unique=False)


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this migration")
