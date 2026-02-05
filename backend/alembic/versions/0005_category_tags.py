"""category tags

Revision ID: 0005_category_tags
Revises: 0004_remove_platforms
Create Date: 2026-02-03

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0005_category_tags"
down_revision = "0004_remove_platforms"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "category_tags",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_category_tags_user_id"),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], name="fk_category_tags_category_id"),
        sa.UniqueConstraint("user_id", "category_id", "name", name="uq_category_tags_user_category_name"),
    )
    op.create_index("ix_category_tags_user_id", "category_tags", ["user_id"], unique=False)
    op.create_index("ix_category_tags_category_id", "category_tags", ["category_id"], unique=False)

    op.create_table(
        "transaction_tags",
        sa.Column("transaction_id", sa.Integer(), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"], name="fk_transaction_tags_transaction_id"),
        sa.ForeignKeyConstraint(["tag_id"], ["category_tags.id"], name="fk_transaction_tags_tag_id"),
        sa.PrimaryKeyConstraint("transaction_id", "tag_id", name="pk_transaction_tags"),
    )
    op.create_index("ix_transaction_tags_transaction_id", "transaction_tags", ["transaction_id"], unique=False)
    op.create_index("ix_transaction_tags_tag_id", "transaction_tags", ["tag_id"], unique=False)


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this migration")
