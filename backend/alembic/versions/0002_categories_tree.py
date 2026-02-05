"""categories tree + transactions.category_id

Revision ID: 0002_categories_tree
Revises: 0001_init
Create Date: 2026-02-03

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0002_categories_tree"
down_revision = "0001_init"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(length=10), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_categories_user_id"),
        sa.ForeignKeyConstraint(["parent_id"], ["categories.id"], name="fk_categories_parent_id"),
    )
    op.create_index("ix_categories_user_id", "categories", ["user_id"], unique=False)
    op.create_index("ix_categories_type", "categories", ["type"], unique=False)
    op.create_index("ix_categories_parent_id", "categories", ["parent_id"], unique=False)

    op.add_column("transactions", sa.Column("category_id", sa.Integer(), nullable=True))
    op.create_index("ix_transactions_category_id", "transactions", ["category_id"], unique=False)
    op.create_foreign_key(
        "fk_transactions_category_id",
        "transactions",
        "categories",
        ["category_id"],
        ["id"],
    )

    # legacy: allow null so new code can write category_id instead
    op.alter_column("transactions", "account_item_id", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    op.alter_column("transactions", "account_item_id", existing_type=sa.Integer(), nullable=False)

    op.drop_constraint("fk_transactions_category_id", "transactions", type_="foreignkey")
    op.drop_index("ix_transactions_category_id", table_name="transactions")
    op.drop_column("transactions", "category_id")

    op.drop_index("ix_categories_parent_id", table_name="categories")
    op.drop_index("ix_categories_type", table_name="categories")
    op.drop_index("ix_categories_user_id", table_name="categories")
    op.drop_table("categories")
