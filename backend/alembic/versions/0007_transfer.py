"""transfer support

Revision ID: 0007_transfer
Revises: 0006_bankacct
Create Date: 2026-02-04

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0007_transfer"
down_revision = "0006_bankacct"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column("to_bank_account_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_transactions_to_bank_account_id",
        "transactions",
        "bank_accounts",
        ["to_bank_account_id"],
        ["id"],
    )
    op.create_index("ix_transactions_to_bank_account_id", "transactions", ["to_bank_account_id"], unique=False)


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this migration")
