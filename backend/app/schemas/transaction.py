from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class TransactionCreate(BaseModel):
    type: str = Field(pattern="^(income|expense)$")
    amountCents: int = Field(ge=0)
    occurredAt: datetime

    categoryId: int

    fundingSource: str = Field(pattern="^(cash|bank)$")
    bankAccountId: int | None = None

    tagIds: list[int] = Field(default_factory=list)

    note: str | None = Field(default=None, max_length=1000)


class TransactionOut(BaseModel):
    id: int
    type: str
    amountCents: int
    occurredAt: datetime
    createdAt: datetime
    categoryId: int | None
    fundingSource: str
    bankAccountId: int | None
    toBankAccountId: int | None = None
    refundOfTransactionId: int | None = None
    refundedCents: int | None = None
    note: str | None

    tagIds: list[int] = Field(default_factory=list)
    tagNames: list[str] = Field(default_factory=list)


class TransactionUpdate(BaseModel):
    occurredAt: datetime | None = None
    categoryId: int | None = None
    tagIds: list[int] | None = None
    # When provided as an empty string, backend will treat it as clearing the note.
    note: str | None = Field(default=None, max_length=1000)


class TransactionListOut(BaseModel):
    items: list[TransactionOut]
    refundItems: list[TransactionOut] = Field(default_factory=list)
    total: int
    incomeCents: int
    expenseCents: int
