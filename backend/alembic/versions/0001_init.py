"""init

Revision ID: 0001_init
Revises: 
Create Date: 2026-02-03

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0001_init"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("username", sa.String(length=50), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("time_zone", sa.String(length=64), nullable=False, server_default=sa.text("'Asia/Shanghai'")),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    op.create_table(
        "bank_accounts",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("bank_name", sa.String(length=100), nullable=False),
        sa.Column("alias", sa.String(length=100), nullable=False),
        sa.Column("last4", sa.String(length=4), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_bank_accounts_user_id"),
    )
    op.create_index("ix_bank_accounts_user_id", "bank_accounts", ["user_id"], unique=False)

    op.create_table(
        "account_items",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(length=10), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("path", sa.String(length=500), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_account_items_user_id"),
    )
    op.create_index("ix_account_items_user_id", "account_items", ["user_id"], unique=False)
    op.create_index("ix_account_items_type", "account_items", ["type"], unique=False)

    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(length=10), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(), nullable=False),
        sa.Column("account_item_id", sa.Integer(), nullable=False),
        sa.Column("funding_source", sa.String(length=10), nullable=False),
        sa.Column("bank_account_id", sa.Integer(), nullable=True),
        sa.Column("note", sa.String(length=1000), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_transactions_user_id"),
        sa.ForeignKeyConstraint(["account_item_id"], ["account_items.id"], name="fk_transactions_account_item_id"),
        sa.ForeignKeyConstraint(["bank_account_id"], ["bank_accounts.id"], name="fk_transactions_bank_account_id"),
        sa.CheckConstraint(
            "(funding_source='cash' AND bank_account_id IS NULL) OR (funding_source='bank' AND bank_account_id IS NOT NULL)",
            name="ck_transactions_funding_source",
        ),
    )
    op.create_index("ix_transactions_user_id", "transactions", ["user_id"], unique=False)
    op.create_index("ix_transactions_type", "transactions", ["type"], unique=False)
    op.create_index("ix_transactions_occurred_at", "transactions", ["occurred_at"], unique=False)
    op.create_index("ix_transactions_account_item_id", "transactions", ["account_item_id"], unique=False)
    op.create_index("ix_transactions_funding_source", "transactions", ["funding_source"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_transactions_funding_source", table_name="transactions")
    op.drop_index("ix_transactions_account_item_id", table_name="transactions")
    op.drop_index("ix_transactions_occurred_at", table_name="transactions")
    op.drop_index("ix_transactions_type", table_name="transactions")
    op.drop_index("ix_transactions_user_id", table_name="transactions")
    op.drop_table("transactions")

    op.drop_index("ix_account_items_type", table_name="account_items")
    op.drop_index("ix_account_items_user_id", table_name="account_items")
    op.drop_table("account_items")

    op.drop_index("ix_bank_accounts_user_id", table_name="bank_accounts")
    op.drop_table("bank_accounts")

    op.drop_index("ix_users_username", table_name="users")
    op.drop_table("users")
