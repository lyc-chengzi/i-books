from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class CategoryTag(Base):
    __tablename__ = "category_tags"
    __table_args__ = (
        UniqueConstraint("user_id", "category_id", "name", name="uq_category_tags_user_category_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)

    # Bound to an expense first-level category (child of an expense root)
    category_id: Mapped[int] = mapped_column(Integer, ForeignKey("categories.id"), index=True)

    name: Mapped[str] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
