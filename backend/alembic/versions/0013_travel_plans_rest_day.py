"""travel plans rest day

Revision ID: 0013_travel_plans_rest_day
Revises: 0012_travel_plans
Create Date: 2026-03-02

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0013_travel_plans_rest_day"
down_revision = "0012_travel_plans"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "travel_plans",
        sa.Column(
            "is_rest_day",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )

    op.create_index("ix_travel_plans_is_rest_day", "travel_plans", ["is_rest_day"])


def downgrade() -> None:
    op.drop_index("ix_travel_plans_is_rest_day", table_name="travel_plans")
    op.drop_column("travel_plans", "is_rest_day")
