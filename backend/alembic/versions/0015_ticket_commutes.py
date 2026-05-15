"""ticket commutes

Revision ID: 0015_ticket_commutes
Revises: 0014_commute_cards
Create Date: 2026-05-15 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0015_ticket_commutes"
down_revision = "0014_commute_cards"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "commute_reservations",
        "card_id",
        existing_type=sa.Integer(),
        nullable=True,
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "commute_reservations",
        "card_id",
        existing_type=sa.Integer(),
        nullable=False,
        existing_nullable=True,
    )