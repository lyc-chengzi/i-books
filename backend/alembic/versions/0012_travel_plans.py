"""travel plans

Revision ID: 0012_travel_plans
Revises: 0011_transaction_audit_logs
Create Date: 2026-03-02

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0012_travel_plans"
down_revision = "0011_transaction_audit_logs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "travel_plans",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("plan_date", sa.Date(), nullable=False),
        sa.Column("am", sa.String(length=500), nullable=True),
        sa.Column("pm", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            nullable=False,
            server_default=sa.text("SYSUTCDATETIME()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=False),
            nullable=False,
            server_default=sa.text("SYSUTCDATETIME()"),
        ),
        sa.UniqueConstraint("user_id", "plan_date", name="uq_travel_plans_user_date"),
    )

    op.create_index("ix_travel_plans_user_id", "travel_plans", ["user_id"])
    op.create_index("ix_travel_plans_plan_date", "travel_plans", ["plan_date"])
    op.create_index("ix_travel_plans_created_at", "travel_plans", ["created_at"])
    op.create_index("ix_travel_plans_updated_at", "travel_plans", ["updated_at"])


def downgrade() -> None:
    op.drop_index("ix_travel_plans_updated_at", table_name="travel_plans")
    op.drop_index("ix_travel_plans_created_at", table_name="travel_plans")
    op.drop_index("ix_travel_plans_plan_date", table_name="travel_plans")
    op.drop_index("ix_travel_plans_user_id", table_name="travel_plans")
    op.drop_table("travel_plans")
