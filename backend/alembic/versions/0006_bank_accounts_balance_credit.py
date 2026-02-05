"""bank account balance and credit card fields

Revision ID: 0006_bankacct
Revises: 0005_category_tags
Create Date: 2026-02-04

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0006_bankacct"
down_revision = "0005_category_tags"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "bank_accounts",
        sa.Column("kind", sa.String(length=10), nullable=False, server_default=sa.text("'debit'")),
    )
    op.add_column(
        "bank_accounts",
        sa.Column("balance_cents", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column(
        "bank_accounts",
        sa.Column("billing_day", sa.Integer(), nullable=True),
    )
    op.add_column(
        "bank_accounts",
        sa.Column("repayment_day", sa.Integer(), nullable=True),
    )

    op.create_index("ix_bank_accounts_kind", "bank_accounts", ["kind"], unique=False)


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this migration")
