"""bank account custom ordering and pin

Revision ID: 0016_bank_account_ordering
Revises: 0015_ticket_commutes
Create Date: 2026-05-21 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0016_bank_account_ordering"
down_revision = "0015_ticket_commutes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "bank_accounts",
        sa.Column("sort_order", sa.Integer(), nullable=True, server_default=sa.text("0")),
    )
    op.add_column(
        "bank_accounts",
        sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default=sa.text("0")),
    )

    op.execute(
        """
        WITH ordered AS (
            SELECT id,
                   ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY id DESC) - 1 AS rn
            FROM bank_accounts
        )
        UPDATE ba
        SET sort_order = ordered.rn
        FROM bank_accounts ba
        JOIN ordered ON ordered.id = ba.id
        """
    )

    op.alter_column(
        "bank_accounts",
        "sort_order",
        existing_type=sa.Integer(),
        nullable=False,
        existing_nullable=True,
    )

    op.create_index("ix_bank_accounts_sort_order", "bank_accounts", ["sort_order"], unique=False)
    op.create_index("ix_bank_accounts_is_pinned", "bank_accounts", ["is_pinned"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_bank_accounts_is_pinned", table_name="bank_accounts")
    op.drop_index("ix_bank_accounts_sort_order", table_name="bank_accounts")
    op.drop_column("bank_accounts", "is_pinned")
    op.drop_column("bank_accounts", "sort_order")
