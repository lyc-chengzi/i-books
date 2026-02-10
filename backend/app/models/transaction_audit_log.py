from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UnicodeText, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class TransactionAuditLog(Base):
    __tablename__ = "transaction_audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=text("SYSUTCDATETIME()"),
        index=True,
    )

    # 'create' | 'update' | 'delete'
    action: Mapped[str] = mapped_column(String(10), index=True)

    # who performed the action
    actor_user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), index=True)

    # which user's ledger was affected (usually equals transaction.user_id)
    target_user_id: Mapped[int] = mapped_column(Integer, index=True)

    # Keep it without FK so logs survive transaction deletions.
    transaction_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)

    tx_type: Mapped[str | None] = mapped_column(String(10), nullable=True, index=True)

    before_json: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
    after_json: Mapped[str | None] = mapped_column(UnicodeText, nullable=True)
