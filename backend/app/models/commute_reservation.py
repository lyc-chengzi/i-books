from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class CommuteReservation(Base):
    __tablename__ = "commute_reservations"
    __table_args__ = (
        UniqueConstraint("user_id", "ride_date", "travel_slot", name="uq_commute_reservations_user_date_slot"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)
    card_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("commute_cards.id"), index=True, nullable=True)

    ride_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    departure_time: Mapped[str] = mapped_column(String(5), nullable=False)
    travel_slot: Mapped[str] = mapped_column(String(2), nullable=False)
    direction: Mapped[str] = mapped_column(String(20), nullable=False)

    train_no: Mapped[str | None] = mapped_column(String(20), nullable=True)
    carriage_no: Mapped[str | None] = mapped_column(String(10), nullable=True)
    seat_no: Mapped[str | None] = mapped_column(String(10), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=text("SYSUTCDATETIME()"),
        index=True,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=text("SYSUTCDATETIME()"),
        index=True,
    )