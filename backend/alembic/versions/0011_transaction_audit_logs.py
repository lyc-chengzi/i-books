"""transaction audit logs

Revision ID: 0011_transaction_audit_logs
Revises: 0010_user_roles
Create Date: 2026-02-10

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0011_transaction_audit_logs"
down_revision = "0010_user_roles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "transaction_audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            nullable=False,
            server_default=sa.text("SYSUTCDATETIME()"),
        ),
        sa.Column("action", sa.String(length=10), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("target_user_id", sa.Integer(), nullable=False),
        sa.Column("transaction_id", sa.Integer(), nullable=True),
        sa.Column("tx_type", sa.String(length=10), nullable=True),
        sa.Column("before_json", sa.UnicodeText(), nullable=True),
        sa.Column("after_json", sa.UnicodeText(), nullable=True),
    )

    op.create_index("ix_transaction_audit_logs_created_at", "transaction_audit_logs", ["created_at"])
    op.create_index("ix_transaction_audit_logs_action", "transaction_audit_logs", ["action"])
    op.create_index("ix_transaction_audit_logs_actor_user_id", "transaction_audit_logs", ["actor_user_id"])
    op.create_index("ix_transaction_audit_logs_target_user_id", "transaction_audit_logs", ["target_user_id"])
    op.create_index("ix_transaction_audit_logs_transaction_id", "transaction_audit_logs", ["transaction_id"])
    op.create_index("ix_transaction_audit_logs_tx_type", "transaction_audit_logs", ["tx_type"])


def downgrade() -> None:
    op.drop_index("ix_transaction_audit_logs_tx_type", table_name="transaction_audit_logs")
    op.drop_index("ix_transaction_audit_logs_transaction_id", table_name="transaction_audit_logs")
    op.drop_index("ix_transaction_audit_logs_target_user_id", table_name="transaction_audit_logs")
    op.drop_index("ix_transaction_audit_logs_actor_user_id", table_name="transaction_audit_logs")
    op.drop_index("ix_transaction_audit_logs_action", table_name="transaction_audit_logs")
    op.drop_index("ix_transaction_audit_logs_created_at", table_name="transaction_audit_logs")
    op.drop_table("transaction_audit_logs")
