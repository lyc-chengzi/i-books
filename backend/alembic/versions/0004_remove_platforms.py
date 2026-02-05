"""remove platforms

Revision ID: 0004_remove_platforms
Revises: 0003_platforms
Create Date: 2026-02-03

"""

from __future__ import annotations

from alembic import op


revision = "0004_remove_platforms"
down_revision = "0003_platforms"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop FK/index/column from transactions
    op.drop_constraint("fk_transactions_platform_id", "transactions", type_="foreignkey")
    op.drop_index("ix_transactions_platform_id", table_name="transactions")
    op.drop_column("transactions", "platform_id")

    # Drop platforms table
    op.drop_index("ix_platforms_user_id", table_name="platforms")
    op.drop_table("platforms")


def downgrade() -> None:
    # Intentionally no downgrade implementation in this MVP.
    raise NotImplementedError("Downgrade not supported")
