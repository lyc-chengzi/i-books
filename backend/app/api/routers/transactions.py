from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from datetime import timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.core.datetime_utils import as_utc, to_utc_naive
from app.models.bank_account import BankAccount
from app.models.category import Category
from app.models.category_tag import CategoryTag
from app.models.transaction import Transaction
from app.models.transaction_tag import TransactionTag
from app.models.user import User
from app.schemas.transaction import TransactionCreate, TransactionOut, TransactionUpdate

router = APIRouter(prefix="/ledger/transactions", tags=["ledger"])


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


@router.get("", response_model=list[TransactionOut])
def list_transactions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TransactionOut]:
    rows = db.scalars(
        select(Transaction)
        .where(Transaction.user_id == current_user.id)
        .order_by(Transaction.occurred_at.asc(), Transaction.id.asc())
    ).all()

    tx_ids = [r.id for r in rows]
    tag_map, tag_name_map = _load_tx_tags(db, tx_ids)

    return [
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
            note=r.note,
            tagIds=tag_map.get(r.id, []),
            tagNames=tag_name_map.get(r.id, []),
        )
        for r in rows
    ]


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
        note=row.note,
        tagIds=tag_ids,
        tagNames=tag_names,
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

        delta = row.amount_cents if row.type == "income" else -row.amount_cents
        reverse = -delta
        if bank.kind == "debit" and bank.balance_cents + reverse < 0:
            raise HTTPException(status_code=400, detail="Insufficient balance")
        bank.balance_cents += reverse
        db.add(bank)

    db.execute(delete(TransactionTag).where(TransactionTag.transaction_id == row.id))
    db.delete(row)
    db.commit()
    return {"ok": True}
