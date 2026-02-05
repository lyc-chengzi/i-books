from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, union_all
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.bank_account import BankAccount
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.bank_account import BankAccountCreate, BankAccountOut, BankAccountUpdate

router = APIRouter(prefix="/config/bank-accounts", tags=["config"])


def _validate_bank_account_fields(
    *, kind: str, billing_day: int | None, repayment_day: int | None
) -> None:
    if kind not in ("debit", "credit"):
        raise HTTPException(status_code=400, detail="Invalid kind")

    if kind == "credit":
        if billing_day is None or repayment_day is None:
            raise HTTPException(status_code=400, detail="Credit card requires billingDay and repaymentDay")
    else:
        if billing_day is not None or repayment_day is not None:
            raise HTTPException(status_code=400, detail="Debit account must not set billingDay/repaymentDay")


@router.get("", response_model=list[BankAccountOut])
def list_bank_accounts(
    orderBy: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[BankAccountOut]:
    base = select(BankAccount).where(BankAccount.user_id == current_user.id)

    if orderBy == "usage":
        usage_source = union_all(
            select(Transaction.bank_account_id.label("bank_account_id")).where(
                Transaction.user_id == current_user.id,
                Transaction.funding_source == "bank",
                Transaction.bank_account_id.is_not(None),
            ),
            select(Transaction.to_bank_account_id.label("bank_account_id")).where(
                Transaction.user_id == current_user.id,
                Transaction.funding_source == "bank",
                Transaction.to_bank_account_id.is_not(None),
            ),
        ).subquery()

        usage_counts = (
            select(
                usage_source.c.bank_account_id.label("bank_account_id"),
                func.count().label("usage_count"),
            )
            .group_by(usage_source.c.bank_account_id)
            .subquery()
        )

        query = (
            base.outerjoin(usage_counts, usage_counts.c.bank_account_id == BankAccount.id)
            .order_by(func.coalesce(usage_counts.c.usage_count, 0).desc(), BankAccount.id.desc())
        )
    else:
        query = base.order_by(BankAccount.id.desc())

    rows = db.scalars(query).all()
    return [
        BankAccountOut(
            id=r.id,
            bankName=r.bank_name,
            alias=r.alias,
            last4=r.last4,
            kind=r.kind,
            balanceCents=r.balance_cents,
            billingDay=r.billing_day,
            repaymentDay=r.repayment_day,
            isActive=r.is_active,
        )
        for r in rows
    ]


@router.post("", response_model=BankAccountOut)
def create_bank_account(
    payload: BankAccountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BankAccountOut:
    _validate_bank_account_fields(kind=payload.kind, billing_day=payload.billingDay, repayment_day=payload.repaymentDay)

    row = BankAccount(
        user_id=current_user.id,
        bank_name=payload.bankName,
        alias=payload.alias,
        last4=payload.last4,
        kind=payload.kind,
        balance_cents=payload.balanceCents,
        billing_day=payload.billingDay,
        repayment_day=payload.repaymentDay,
        is_active=payload.isActive,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return BankAccountOut(
        id=row.id,
        bankName=row.bank_name,
        alias=row.alias,
        last4=row.last4,
        kind=row.kind,
        balanceCents=row.balance_cents,
        billingDay=row.billing_day,
        repaymentDay=row.repayment_day,
        isActive=row.is_active,
    )


@router.patch("/{bank_account_id}", response_model=BankAccountOut)
def update_bank_account(
    bank_account_id: int,
    payload: BankAccountUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BankAccountOut:
    row = db.get(BankAccount, bank_account_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Bank account not found")

    next_kind = payload.kind if payload.kind is not None else row.kind
    if next_kind == "debit":
        next_billing = None
        next_repayment = None
    else:
        next_billing = payload.billingDay if payload.billingDay is not None else row.billing_day
        next_repayment = payload.repaymentDay if payload.repaymentDay is not None else row.repayment_day

    _validate_bank_account_fields(kind=next_kind, billing_day=next_billing, repayment_day=next_repayment)

    if payload.bankName is not None:
        row.bank_name = payload.bankName
    if payload.alias is not None:
        row.alias = payload.alias
    if payload.last4 is not None:
        row.last4 = payload.last4
    if payload.kind is not None:
        row.kind = payload.kind
    if payload.balanceCents is not None:
        row.balance_cents = payload.balanceCents
    if next_kind == "debit":
        row.billing_day = None
        row.repayment_day = None
    else:
        row.billing_day = next_billing
        row.repayment_day = next_repayment
    if payload.isActive is not None:
        row.is_active = payload.isActive

    db.add(row)
    db.commit()
    db.refresh(row)

    return BankAccountOut(
        id=row.id,
        bankName=row.bank_name,
        alias=row.alias,
        last4=row.last4,
        kind=row.kind,
        balanceCents=row.balance_cents,
        billingDay=row.billing_day,
        repaymentDay=row.repayment_day,
        isActive=row.is_active,
    )
