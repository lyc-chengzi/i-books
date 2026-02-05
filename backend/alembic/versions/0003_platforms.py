"""platforms + transactions.platform_id

Revision ID: 0003_platforms
Revises: 0002_categories_tree
Create Date: 2026-02-03

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0003_platforms"
down_revision = "0002_categories_tree"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "platforms",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_platforms_user_id"),
    )
    op.create_index("ix_platforms_user_id", "platforms", ["user_id"], unique=False)

    op.add_column("transactions", sa.Column("platform_id", sa.Integer(), nullable=True))
    op.create_index("ix_transactions_platform_id", "transactions", ["platform_id"], unique=False)
    op.create_foreign_key(
        "fk_transactions_platform_id",
        "transactions",
        "platforms",
        ["platform_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_transactions_platform_id", "transactions", type_="foreignkey")
    op.drop_index("ix_transactions_platform_id", table_name="transactions")
    op.drop_column("transactions", "platform_id")

    op.drop_index("ix_platforms_user_id", table_name="platforms")
    op.drop_table("platforms")
