from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class TransactionAuditLogOut(BaseModel):
    id: int
    action: str

    actorUserId: int
    targetUserId: int

    transactionId: int | None = None
    txType: str | None = None

    createdAt: datetime

    before: dict[str, Any] | None = None
    after: dict[str, Any] | None = None


class TransactionAuditLogListOut(BaseModel):
    items: list[TransactionAuditLogOut] = Field(default_factory=list)
    total: int
