from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class BankAccount(Base):
    __tablename__ = "bank_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)

    bank_name: Mapped[str] = mapped_column(String(100))
    alias: Mapped[str] = mapped_column(String(100))
    last4: Mapped[str | None] = mapped_column(String(4), nullable=True)

    # 'debit' | 'credit'
    kind: Mapped[str] = mapped_column(String(10), default="debit", index=True)
    balance_cents: Mapped[int] = mapped_column(Integer, default=0)

    # credit card only (1-31)
    billing_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    repayment_day: Mapped[int | None] = mapped_column(Integer, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
