from __future__ import annotations

from pydantic import BaseModel, Field


BankAccountKind = str


class BankAccountCreate(BaseModel):
    bankName: str = Field(min_length=1)
    alias: str = Field(min_length=1)
    last4: str | None = Field(default=None, min_length=4, max_length=4)
    kind: BankAccountKind = Field(default="debit", pattern="^(debit|credit)$")
    balanceCents: int = 0
    billingDay: int | None = Field(default=None, ge=1, le=31)
    repaymentDay: int | None = Field(default=None, ge=1, le=31)
    isActive: bool = True


class BankAccountUpdate(BaseModel):
    bankName: str | None = Field(default=None, min_length=1)
    alias: str | None = Field(default=None, min_length=1)
    last4: str | None = Field(default=None, min_length=4, max_length=4)
    kind: BankAccountKind | None = Field(default=None, pattern="^(debit|credit)$")
    balanceCents: int | None = None
    billingDay: int | None = Field(default=None, ge=1, le=31)
    repaymentDay: int | None = Field(default=None, ge=1, le=31)
    isActive: bool | None = None


class BankAccountOut(BaseModel):
    id: int
    bankName: str
    alias: str
    last4: str | None
    kind: BankAccountKind
    balanceCents: int
    billingDay: int | None
    repaymentDay: int | None
    isActive: bool
