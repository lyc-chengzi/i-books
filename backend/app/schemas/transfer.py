from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class TransferCreate(BaseModel):
    fromBankAccountId: int
    toBankAccountId: int
    amountCents: int = Field(ge=0)
    occurredAt: datetime
    note: str | None = None
