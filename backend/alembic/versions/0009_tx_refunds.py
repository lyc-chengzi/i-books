"""transaction refunds linkage

Revision ID: 0009_tx_refunds
Revises: 0008_tx_created_at
Create Date: 2026-02-06

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0009_tx_refunds"
down_revision = "0008_tx_created_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column("refund_of_transaction_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_transactions_refund_of_transaction_id",
        "transactions",
        "transactions",
        ["refund_of_transaction_id"],
        ["id"],
    )
    op.create_index(
        "ix_transactions_refund_of_transaction_id",
        "transactions",
        ["refund_of_transaction_id"],
        unique=False,
    )


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this migration")
