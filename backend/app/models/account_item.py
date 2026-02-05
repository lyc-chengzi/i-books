from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AccountItem(Base):
    __tablename__ = "account_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)

    # 'income' | 'expense'
    type: Mapped[str] = mapped_column(String(10), index=True)
    name: Mapped[str] = mapped_column(String(200))

    # For display/statistics, e.g. '交通消费/汽车消费/加油费'
    path: Mapped[str] = mapped_column(String(500))

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
