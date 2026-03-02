from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class TravelPlan(Base):
    __tablename__ = "travel_plans"
    __table_args__ = (UniqueConstraint("user_id", "plan_date", name="uq_travel_plans_user_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)

    plan_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    is_rest_day: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("0"))

    am: Mapped[str | None] = mapped_column(String(500), nullable=True)
    pm: Mapped[str | None] = mapped_column(String(500), nullable=True)

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
