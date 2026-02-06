from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone

from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.core.datetime_utils import as_utc, to_utc_naive
from app.models.bank_account import BankAccount
from app.models.category import Category
from app.models.category_tag import CategoryTag
from app.models.transaction import Transaction
from app.models.transaction_tag import TransactionTag
from app.models.user import User
from app.schemas.transaction import TransactionCreate, TransactionListOut, TransactionOut, TransactionUpdate

router = APIRouter(prefix="/ledger/transactions", tags=["ledger"])


class RefundCreate(BaseModel):
    mode: str = Field(pattern="^(full|partial)$")
    amountCents: int | None = Field(default=None, ge=1)
    occurredAt: datetime | None = None
    note: str | None = None


def _ensure_leaf_category(db: Session, current_user: User, category_id: int, expected_type: str) -> Category:
    category = db.get(Category, category_id)
    if not category or category.user_id != current_user.id or not category.is_active:
        raise HTTPException(status_code=400, detail="Invalid categoryId")
    if category.type != expected_type:
        raise HTTPException(status_code=400, detail="Income/expense type mismatch")

    has_child = (
        db.scalar(
            select(Category.id)
            .where(Category.user_id == current_user.id, Category.parent_id == category.id)
            .limit(1)
        )
        is not None
    )
    if has_child:
        raise HTTPException(status_code=400, detail="Category must be a leaf node")

    return category


def _validate_and_resolve_tags(
    db: Session,
    current_user: User,
    category: Category,
    tag_ids: list[int],
) -> tuple[list[int], list[str]]:
    if category.type != "expense":
        raise HTTPException(status_code=400, detail="Tags are only supported for expense")

    # Find the first-level expense category (child of an expense root)
    cursor = category
    top_level: Category | None = None
    while cursor.parent_id is not None:
        parent = db.get(Category, cursor.parent_id)
        if not parent or parent.user_id != current_user.id:
            raise HTTPException(status_code=400, detail="Invalid category ancestry")
        if parent.parent_id is None:
            top_level = cursor
            break
        cursor = parent

    if not top_level:
        raise HTTPException(status_code=400, detail="Invalid category for tags")

    unique_ids = sorted({int(x) for x in tag_ids})
    tags = db.scalars(
        select(CategoryTag).where(
            CategoryTag.user_id == current_user.id,
            CategoryTag.id.in_(unique_ids),
        )
    ).all()
    if len(tags) != len(unique_ids):
        raise HTTPException(status_code=400, detail="Invalid tagIds")

    tag_by_id = {int(t.id): t for t in tags}
    for t in tags:
        if not t.is_active:
            raise HTTPException(status_code=400, detail="Tag is inactive")
        if t.category_id != top_level.id:
            raise HTTPException(status_code=400, detail="Tag does not belong to selected category")

    return unique_ids, [tag_by_id[tag_id].name for tag_id in unique_ids]


def _load_tx_tags(db: Session, tx_ids: list[int]) -> tuple[dict[int, list[int]], dict[int, list[str]]]:
    tag_map: dict[int, list[int]] = {}
    tag_name_map: dict[int, list[str]] = {}
    if not tx_ids:
        return tag_map, tag_name_map

    pairs = db.execute(
        select(TransactionTag.transaction_id, TransactionTag.tag_id, CategoryTag.name)
        .join(CategoryTag, CategoryTag.id == TransactionTag.tag_id)
        .where(TransactionTag.transaction_id.in_(tx_ids))
    ).all()
    for tx_id, tag_id, tag_name in pairs:
        tag_map.setdefault(int(tx_id), []).append(int(tag_id))
        tag_name_map.setdefault(int(tx_id), []).append(str(tag_name))

    return tag_map, tag_name_map


@router.get("", response_model=TransactionListOut)
def list_transactions(
    type: str = "all",
    fundingSource: str = "all",
    bankAccountId: int | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
    keyword: str | None = None,
    page: int = 1,
    pageSize: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TransactionListOut:
    if type not in ("all", "income", "expense", "transfer", "refund"):
        raise HTTPException(status_code=400, detail="Invalid type")
    if fundingSource not in ("all", "cash", "bank"):
        raise HTTPException(status_code=400, detail="Invalid fundingSource")
    if page < 1:
        raise HTTPException(status_code=400, detail="Invalid page")
    if pageSize < 1 or pageSize > 200:
        raise HTTPException(status_code=400, detail="Invalid pageSize")

    filters = [Transaction.user_id == current_user.id]

    if type != "all":
        filters.append(Transaction.type == type)
    else:
        # Default behavior: show refunds as children under their original payment,
        # not as top-level rows.
        filters.append(Transaction.type != "refund")

    if fundingSource != "all":
        # Match frontend behavior: if fundingSource filter is used, exclude transfers.
        filters.append(Transaction.type != "transfer")
        filters.append(Transaction.funding_source == fundingSource)

    if bankAccountId is not None:
        # Match frontend behavior: include rows where selected bank account is involved (transfer included).
        filters.append(
            (Transaction.bank_account_id == bankAccountId)
            | (Transaction.to_bank_account_id == bankAccountId)
        )

    if start is not None:
        filters.append(Transaction.occurred_at >= to_utc_naive(start))
    if end is not None:
        filters.append(Transaction.occurred_at <= to_utc_naive(end))

    kw = (keyword or "").strip().lower()
    if kw:
        like = f"%{kw}%"
        note_match = func.lower(func.coalesce(Transaction.note, "")).like(like)
        tag_exists = (
            select(TransactionTag.transaction_id)
            .join(CategoryTag, CategoryTag.id == TransactionTag.tag_id)
            .where(
                TransactionTag.transaction_id == Transaction.id,
                func.lower(CategoryTag.name).like(like),
            )
            .limit(1)
            .exists()
        )
        filters.append(note_match | tag_exists)

    base = select(Transaction).where(*filters)

    total = int(db.scalar(select(func.count()).select_from(base.subquery())) or 0)

    income_cents = int(
        db.scalar(
            select(func.coalesce(func.sum(Transaction.amount_cents), 0)).where(
                *filters,
                Transaction.type == "income",
            )
        )
        or 0
    )
    expense_cents = int(
        db.scalar(
            select(func.coalesce(func.sum(Transaction.amount_cents), 0)).where(
                *filters,
                Transaction.type == "expense",
            )
        )
        or 0
    )

    rows = db.scalars(
        base.order_by(Transaction.occurred_at.asc(), Transaction.id.asc())
        .offset((page - 1) * pageSize)
        .limit(pageSize)
    ).all()

    tx_ids = [int(r.id) for r in rows]
    tag_map, tag_name_map = _load_tx_tags(db, tx_ids)

    refundable_ids = [int(r.id) for r in rows if r.type == "expense"]
    refund_sum_map: dict[int, int] = {}
    if refundable_ids:
        refund_rows = db.execute(
            select(Transaction.refund_of_transaction_id, func.coalesce(func.sum(Transaction.amount_cents), 0))
            .where(
                Transaction.user_id == current_user.id,
                Transaction.type == "refund",
                Transaction.refund_of_transaction_id.in_(refundable_ids),
            )
            .group_by(Transaction.refund_of_transaction_id)
        ).all()
        for refund_of_id, amount in refund_rows:
            if refund_of_id is None:
                continue
            refund_sum_map[int(refund_of_id)] = int(amount or 0)

    # Refund children for items in this page
    refund_items: list[TransactionOut] = []
    if refundable_ids:
        refund_rows = db.scalars(
            select(Transaction)
            .where(
                Transaction.user_id == current_user.id,
                Transaction.type == "refund",
                Transaction.refund_of_transaction_id.in_(refundable_ids),
            )
            .order_by(Transaction.occurred_at.asc(), Transaction.id.asc())
        ).all()
        refund_items = [
            TransactionOut(
                id=r.id,
                type=r.type,
                amountCents=r.amount_cents,
                occurredAt=as_utc(r.occurred_at),
                createdAt=as_utc(r.created_at),
                categoryId=r.category_id,
                fundingSource=r.funding_source,
                bankAccountId=r.bank_account_id,
                toBankAccountId=getattr(r, "to_bank_account_id", None),
                refundOfTransactionId=getattr(r, "refund_of_transaction_id", None),
                refundedCents=None,
                note=r.note,
                tagIds=[],
                tagNames=[],
            )
            for r in refund_rows
        ]

    items = [
        TransactionOut(
            id=r.id,
            type=r.type,
            amountCents=r.amount_cents,
            occurredAt=as_utc(r.occurred_at),
            createdAt=as_utc(r.created_at),
            categoryId=r.category_id,
            fundingSource=r.funding_source,
            bankAccountId=r.bank_account_id,
            toBankAccountId=getattr(r, "to_bank_account_id", None),
            refundOfTransactionId=getattr(r, "refund_of_transaction_id", None),
            refundedCents=refund_sum_map.get(int(r.id)) if r.type == "expense" else None,
            note=r.note,
            tagIds=tag_map.get(r.id, []),
            tagNames=tag_name_map.get(r.id, []),
        )
        for r in rows
    ]

    return TransactionListOut(
        items=items,
        refundItems=refund_items,
        total=total,
        incomeCents=income_cents,
        expenseCents=expense_cents,
    )


@router.post("", response_model=TransactionOut)
def create_transaction(
    payload: TransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TransactionOut:
    category = _ensure_leaf_category(db, current_user, payload.categoryId, payload.type)

    tag_ids: list[int] = []
    tag_names: list[str] = []
    if payload.tagIds:
        if payload.type != "expense":
            raise HTTPException(status_code=400, detail="Tags are only supported for expense")
        tag_ids, tag_names = _validate_and_resolve_tags(db, current_user, category, payload.tagIds)


    if payload.fundingSource == "cash":
        if payload.bankAccountId is not None:
            raise HTTPException(status_code=400, detail="Cash must not set bankAccountId")
        bank_account_id = None
        bank: BankAccount | None = None
    else:
        if payload.bankAccountId is None:
            raise HTTPException(status_code=400, detail="Bank fundingSource requires bankAccountId")
        bank = db.get(BankAccount, payload.bankAccountId)
        if not bank or bank.user_id != current_user.id or not bank.is_active:
            raise HTTPException(status_code=400, detail="Invalid bankAccountId")
        bank_account_id = bank.id

        delta = payload.amountCents if payload.type == "income" else -payload.amountCents
        if bank.kind == "debit" and bank.balance_cents + delta < 0:
            raise HTTPException(status_code=400, detail="Insufficient balance")

        bank.balance_cents += delta

    row = Transaction(
        user_id=current_user.id,
        type=payload.type,
        amount_cents=payload.amountCents,
        occurred_at=to_utc_naive(payload.occurredAt),
        account_item_id=None,
        category_id=category.id,
        funding_source=payload.fundingSource,
        bank_account_id=bank_account_id,
        to_bank_account_id=None,
        refund_of_transaction_id=None,
        note=payload.note,
    )
    db.add(row)

    db.flush()
    for tag_id in tag_ids:
        db.add(TransactionTag(transaction_id=row.id, tag_id=tag_id))

    if bank is not None:
        db.add(bank)

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
        tagIds=tag_ids,
        tagNames=tag_names,
    )


@router.post("/{tx_id}/refund", response_model=TransactionOut)
def create_refund(
    tx_id: int,
    payload: RefundCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TransactionOut:
    """Create a refund record for a bank-funded expense.

    Refund is stored as a dedicated `type='refund'` transaction.
    This keeps refund separate from income/expense stats.
    """

    original = db.get(Transaction, tx_id)
    if not original or original.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if original.type != "expense":
        raise HTTPException(status_code=400, detail="Only expense supports refund")
    if original.funding_source != "bank" or original.bank_account_id is None:
        raise HTTPException(status_code=400, detail="Only bank-funded expense supports refund")
    if original.amount_cents <= 0:
        raise HTTPException(status_code=400, detail="Invalid original amount")
    if getattr(original, "refund_of_transaction_id", None) is not None:
        raise HTTPException(status_code=400, detail="Refund transaction cannot be refunded")

    refunded_sum = db.scalar(
        select(func.coalesce(func.sum(Transaction.amount_cents), 0)).where(
            Transaction.user_id == current_user.id,
            Transaction.refund_of_transaction_id == original.id,
            Transaction.type == "refund",
        )
    )
    refunded_cents = int(refunded_sum or 0)
    remaining = int(original.amount_cents) - refunded_cents

    if remaining <= 0:
        raise HTTPException(status_code=400, detail="Already fully refunded")

    if payload.mode == "full":
        refund_cents = remaining
    else:
        if payload.amountCents is None:
            raise HTTPException(status_code=400, detail="amountCents is required for partial refund")
        refund_cents = int(payload.amountCents)
        if refund_cents <= 0:
            raise HTTPException(status_code=400, detail="Invalid refund amount")
        if refund_cents > remaining:
            raise HTTPException(status_code=400, detail="Refund amount exceeds remaining")

    bank = db.get(BankAccount, original.bank_account_id)
    if not bank or bank.user_id != current_user.id:
        raise HTTPException(status_code=400, detail="Invalid bankAccountId")

    # refund increases available balance
    bank.balance_cents += refund_cents

    occurred_at = payload.occurredAt or datetime.now(timezone.utc)
    note = payload.note
    if note is None or not str(note).strip():
        note = "退款"

    row = Transaction(
        user_id=current_user.id,
        type="refund",
        amount_cents=refund_cents,
        occurred_at=to_utc_naive(occurred_at),
        account_item_id=None,
        category_id=original.category_id,
        funding_source="bank",
        bank_account_id=original.bank_account_id,
        to_bank_account_id=None,
        refund_of_transaction_id=original.id,
        note=note,
    )
    db.add_all([row, bank])
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
        toBankAccountId=getattr(row, "to_bank_account_id", None),
        refundOfTransactionId=getattr(row, "refund_of_transaction_id", None),
        refundedCents=None,
        note=row.note,
        tagIds=[],
        tagNames=[],
    )


@router.patch("/{tx_id}", response_model=TransactionOut)
def update_transaction(
    tx_id: int,
    payload: TransactionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TransactionOut:
    row = db.get(Transaction, tx_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if row.type == "transfer":
        raise HTTPException(status_code=400, detail="Transfer is not editable")
    if row.type == "refund":
        raise HTTPException(status_code=400, detail="Refund is not editable")

    if payload.occurredAt is not None:
        row.occurred_at = to_utc_naive(payload.occurredAt)

    category = None
    if payload.categoryId is not None:
        category = _ensure_leaf_category(db, current_user, payload.categoryId, row.type)
        row.category_id = category.id
    elif row.category_id is not None:
        category = db.get(Category, row.category_id)

    tag_ids: list[int] = []
    tag_names: list[str] = []

    if payload.tagIds is not None:
        if row.type != "expense":
            raise HTTPException(status_code=400, detail="Tags are only supported for expense")
        if not category:
            raise HTTPException(status_code=400, detail="Invalid categoryId")
        tag_ids, tag_names = _validate_and_resolve_tags(db, current_user, category, payload.tagIds)

        db.execute(delete(TransactionTag).where(TransactionTag.transaction_id == row.id))
        for tag_id in tag_ids:
            db.add(TransactionTag(transaction_id=row.id, tag_id=tag_id))

    db.add(row)
    db.commit()
    db.refresh(row)

    if payload.tagIds is None:
        tag_map, tag_name_map = _load_tx_tags(db, [row.id])
        tag_ids = tag_map.get(row.id, [])
        tag_names = tag_name_map.get(row.id, [])

    return TransactionOut(
        id=row.id,
        type=row.type,
        amountCents=row.amount_cents,
        occurredAt=as_utc(row.occurred_at),
        createdAt=as_utc(row.created_at),
        categoryId=row.category_id,
        fundingSource=row.funding_source,
        bankAccountId=row.bank_account_id,
        toBankAccountId=getattr(row, "to_bank_account_id", None),
        refundOfTransactionId=getattr(row, "refund_of_transaction_id", None),
        refundedCents=None,
        note=row.note,
        tagIds=tag_ids,
        tagNames=tag_names,
    )


@router.delete("/{tx_id}")
def delete_transaction(
    tx_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    row = db.get(Transaction, tx_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Prevent deleting a payment that has refunds (keeps linkage and avoids FK errors)
    if getattr(row, "refund_of_transaction_id", None) is None:
        has_refund = (
            db.scalar(
                select(Transaction.id)
                .where(
                    Transaction.user_id == current_user.id,
                    Transaction.refund_of_transaction_id == row.id,
                )
                .limit(1)
            )
            is not None
        )
        if has_refund:
            raise HTTPException(status_code=400, detail="Cannot delete: this transaction has refund records")

    # Reverse bank balance effects
    if row.type == "transfer":
        if row.bank_account_id is None or getattr(row, "to_bank_account_id", None) is None:
            raise HTTPException(status_code=400, detail="Invalid transfer")

        from_acct = db.get(BankAccount, row.bank_account_id)
        to_acct = db.get(BankAccount, row.to_bank_account_id)
        if not from_acct or from_acct.user_id != current_user.id:
            raise HTTPException(status_code=400, detail="Invalid fromBankAccountId")
        if not to_acct or to_acct.user_id != current_user.id:
            raise HTTPException(status_code=400, detail="Invalid toBankAccountId")

        # undo: from +amount, to -amount
        if to_acct.kind == "debit" and to_acct.balance_cents - row.amount_cents < 0:
            raise HTTPException(status_code=400, detail="Insufficient balance")

        from_acct.balance_cents += row.amount_cents
        to_acct.balance_cents -= row.amount_cents
        db.add_all([from_acct, to_acct])

    elif row.funding_source == "bank" and row.bank_account_id is not None:
        bank = db.get(BankAccount, row.bank_account_id)
        if not bank or bank.user_id != current_user.id:
            raise HTTPException(status_code=400, detail="Invalid bankAccountId")

        if row.type in ("income", "refund"):
            delta = row.amount_cents
        elif row.type == "expense":
            delta = -row.amount_cents
        else:
            raise HTTPException(status_code=400, detail="Invalid transaction type")
        reverse = -delta
        if bank.kind == "debit" and bank.balance_cents + reverse < 0:
            raise HTTPException(status_code=400, detail="Insufficient balance")
        bank.balance_cents += reverse
        db.add(bank)

    db.execute(delete(TransactionTag).where(TransactionTag.transaction_id == row.id))
    db.delete(row)
    db.commit()
    return {"ok": True}
