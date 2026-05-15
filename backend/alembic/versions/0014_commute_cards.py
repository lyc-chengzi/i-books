"""commute cards

Revision ID: 0014_commute_cards
Revises: 0013_travel_plans_rest_day
Create Date: 2026-05-15

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0014_commute_cards"
down_revision = "0013_travel_plans_rest_day"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "commute_cards",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("trip_count", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=False),
            nullable=False,
            server_default=sa.text("SYSUTCDATETIME()"),
        ),
        sa.UniqueConstraint("user_id", "id", name="uq_commute_cards_user_id_id"),
    )
    op.create_index("ix_commute_cards_user_id", "commute_cards", ["user_id"])
    op.create_index("ix_commute_cards_created_at", "commute_cards", ["created_at"])

    op.create_table(
        "commute_reservations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("card_id", sa.Integer(), sa.ForeignKey("commute_cards.id"), nullable=False),
        sa.Column("ride_date", sa.Date(), nullable=False),
        sa.Column("departure_time", sa.String(length=5), nullable=False),
        sa.Column("travel_slot", sa.String(length=2), nullable=False),
        sa.Column("direction", sa.String(length=20), nullable=False),
        sa.Column("train_no", sa.String(length=20), nullable=True),
        sa.Column("carriage_no", sa.String(length=10), nullable=True),
        sa.Column("seat_no", sa.String(length=10), nullable=True),
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
        sa.UniqueConstraint("user_id", "ride_date", "travel_slot", name="uq_commute_reservations_user_date_slot"),
    )
    op.create_index("ix_commute_reservations_user_id", "commute_reservations", ["user_id"])
    op.create_index("ix_commute_reservations_card_id", "commute_reservations", ["card_id"])
    op.create_index("ix_commute_reservations_ride_date", "commute_reservations", ["ride_date"])
    op.create_index("ix_commute_reservations_created_at", "commute_reservations", ["created_at"])
    op.create_index("ix_commute_reservations_updated_at", "commute_reservations", ["updated_at"])


def downgrade() -> None:
    op.drop_index("ix_commute_reservations_updated_at", table_name="commute_reservations")
    op.drop_index("ix_commute_reservations_created_at", table_name="commute_reservations")
    op.drop_index("ix_commute_reservations_ride_date", table_name="commute_reservations")
    op.drop_index("ix_commute_reservations_card_id", table_name="commute_reservations")
    op.drop_index("ix_commute_reservations_user_id", table_name="commute_reservations")
    op.drop_table("commute_reservations")

    op.drop_index("ix_commute_cards_created_at", table_name="commute_cards")
    op.drop_index("ix_commute_cards_user_id", table_name="commute_cards")
    op.drop_table("commute_cards")