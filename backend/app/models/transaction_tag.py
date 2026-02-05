from __future__ import annotations

from sqlalchemy import ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class TransactionTag(Base):
    __tablename__ = "transaction_tags"

    transaction_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("transactions.id"), primary_key=True, index=True
    )
    tag_id: Mapped[int] = mapped_column(Integer, ForeignKey("category_tags.id"), primary_key=True, index=True)
