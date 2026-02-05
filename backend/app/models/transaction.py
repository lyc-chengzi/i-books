from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)

    # 'income' | 'expense'
    type: Mapped[str] = mapped_column(String(10), index=True)

    amount_cents: Mapped[int] = mapped_column(Integer)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=text("SYSUTCDATETIME()"),
        index=True,
    )

    # Legacy (kept nullable for migration compatibility)
    account_item_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("account_items.id"), nullable=True, index=True)

    # New: leaf category selection
    category_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("categories.id"), nullable=True, index=True)

    # 'cash' | 'bank'
    funding_source: Mapped[str] = mapped_column(String(10), index=True)
    bank_account_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("bank_accounts.id"), nullable=True)

    # Transfer only: destination account
    to_bank_account_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("bank_accounts.id"), nullable=True)

    note: Mapped[str | None] = mapped_column(String(1000), nullable=True)
