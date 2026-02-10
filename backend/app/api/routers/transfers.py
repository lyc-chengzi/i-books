from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.core.audit_log import add_transaction_audit_log, build_transaction_snapshot
from app.core.datetime_utils import as_utc, to_utc_naive
from app.models.bank_account import BankAccount
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.transfer import TransferCreate
from app.schemas.transaction import TransactionOut

router = APIRouter(prefix="/ledger/transfers", tags=["ledger"])


@router.post("", response_model=TransactionOut)
def create_transfer(
    payload: TransferCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TransactionOut:
    if payload.fromBankAccountId == payload.toBankAccountId:
        raise HTTPException(status_code=400, detail="fromBankAccountId must not equal toBankAccountId")

    from_acct = db.get(BankAccount, payload.fromBankAccountId)
    to_acct = db.get(BankAccount, payload.toBankAccountId)

    if not from_acct or from_acct.user_id != current_user.id or not from_acct.is_active:
        raise HTTPException(status_code=400, detail="Invalid fromBankAccountId")
    if not to_acct or to_acct.user_id != current_user.id or not to_acct.is_active:
        raise HTTPException(status_code=400, detail="Invalid toBankAccountId")

    if from_acct.kind == "debit" and from_acct.balance_cents - payload.amountCents < 0:
        raise HTTPException(status_code=400, detail="Insufficient balance")

    from_acct.balance_cents -= payload.amountCents
    to_acct.balance_cents += payload.amountCents

    row = Transaction(
        user_id=current_user.id,
        type="transfer",
        amount_cents=payload.amountCents,
        occurred_at=to_utc_naive(payload.occurredAt),
        account_item_id=None,
        category_id=None,
        funding_source="bank",
        bank_account_id=from_acct.id,
        to_bank_account_id=to_acct.id,
        note=payload.note,
    )
    db.add_all([row, from_acct, to_acct])
    db.flush()

    after = build_transaction_snapshot(row, tag_ids=[], tag_names=[])
    add_transaction_audit_log(
        db,
        action="create",
        actor_user_id=current_user.id,
        target_user_id=current_user.id,
        transaction_id=row.id,
        tx_type=row.type,
        before=None,
        after=after,
    )
    db.commit()
    db.refresh(row)

    return TransactionOut(
        id=row.id,
        type=row.type,
        amountCents=row.amount_cents,
        occurredAt=as_utc(row.occurred_at),
        createdAt=as_utc(row.created_at),
        categoryId=row.category_id,
        fundingSource=row.funding_source,
        bankAccountId=row.bank_account_id,
        toBankAccountId=row.to_bank_account_id,
        refundOfTransactionId=getattr(row, "refund_of_transaction_id", None),
        refundedCents=None,
        note=row.note,
        tagIds=[],
        tagNames=[],
    )
