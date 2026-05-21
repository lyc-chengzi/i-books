from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.bank_account import BankAccount
from app.models.user import User
from app.schemas.bank_account import (
    BankAccountCreate,
    BankAccountOut,
    BankAccountReorderRequest,
    BankAccountUpdate,
)

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

    # `orderBy` is kept for backward compatibility. Bank account lists now always
    # follow user-defined order with pinned accounts first.
    _ = orderBy
    query = base.order_by(BankAccount.is_pinned.desc(), BankAccount.sort_order.asc(), BankAccount.id.desc())

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
            sortOrder=r.sort_order,
            isPinned=r.is_pinned,
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

    max_sort_order = db.scalar(select(func.max(BankAccount.sort_order)).where(BankAccount.user_id == current_user.id))
    next_sort_order = (max_sort_order if max_sort_order is not None else -1) + 1

    row = BankAccount(
        user_id=current_user.id,
        bank_name=payload.bankName,
        alias=payload.alias,
        last4=payload.last4,
        kind=payload.kind,
        balance_cents=payload.balanceCents,
        billing_day=payload.billingDay,
        repayment_day=payload.repaymentDay,
        sort_order=next_sort_order,
        is_pinned=False,
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
        sortOrder=row.sort_order,
        isPinned=row.is_pinned,
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
        sortOrder=row.sort_order,
        isPinned=row.is_pinned,
        isActive=row.is_active,
    )


@router.post("/reorder")
def reorder_bank_accounts(
    payload: BankAccountReorderRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, bool]:
    rows = db.scalars(select(BankAccount).where(BankAccount.user_id == current_user.id)).all()
    all_ids = [r.id for r in rows]
    payload_ids = payload.ids

    if len(set(payload_ids)) != len(payload_ids):
        raise HTTPException(status_code=400, detail="Duplicate ids in reorder payload")

    if set(payload_ids) != set(all_ids):
        raise HTTPException(status_code=400, detail="Reorder payload must include all bank account ids")

    order_map = {account_id: idx for idx, account_id in enumerate(payload_ids)}
    for row in rows:
        row.sort_order = order_map[row.id]
        db.add(row)

    db.commit()
    return {"ok": True}


@router.post("/{bank_account_id}/pin", response_model=BankAccountOut)
def pin_bank_account(
    bank_account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BankAccountOut:
    row = db.get(BankAccount, bank_account_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Bank account not found")

    min_sort_order = db.scalar(select(func.min(BankAccount.sort_order)).where(BankAccount.user_id == current_user.id))
    row.sort_order = (min_sort_order if min_sort_order is not None else 0) - 1
    row.is_pinned = True
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
        sortOrder=row.sort_order,
        isPinned=row.is_pinned,
        isActive=row.is_active,
    )


@router.post("/{bank_account_id}/unpin", response_model=BankAccountOut)
def unpin_bank_account(
    bank_account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BankAccountOut:
    row = db.get(BankAccount, bank_account_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Bank account not found")

    max_sort_order = db.scalar(select(func.max(BankAccount.sort_order)).where(BankAccount.user_id == current_user.id))
    row.sort_order = (max_sort_order if max_sort_order is not None else -1) + 1
    row.is_pinned = False
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
        sortOrder=row.sort_order,
        isPinned=row.is_pinned,
        isActive=row.is_active,
    )
