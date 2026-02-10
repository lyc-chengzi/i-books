from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from app.core.datetime_utils import as_utc
from app.models.transaction import Transaction
from app.models.transaction_audit_log import TransactionAuditLog


def _dt_iso(dt) -> str | None:
    if dt is None:
        return None
    # Return ISO8601 in UTC.
    return as_utc(dt).isoformat()


def build_transaction_snapshot(
    tx: Transaction,
    *,
    tag_ids: list[int] | None = None,
    tag_names: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "id": int(tx.id),
        "userId": int(tx.user_id),
        "type": str(tx.type),
        "amountCents": int(tx.amount_cents),
        "occurredAt": _dt_iso(getattr(tx, "occurred_at", None)),
        "createdAt": _dt_iso(getattr(tx, "created_at", None)),
        "categoryId": int(tx.category_id) if tx.category_id is not None else None,
        "fundingSource": str(tx.funding_source),
        "bankAccountId": int(tx.bank_account_id) if tx.bank_account_id is not None else None,
        "toBankAccountId": int(getattr(tx, "to_bank_account_id", None)) if getattr(tx, "to_bank_account_id", None) is not None else None,
        "refundOfTransactionId": int(getattr(tx, "refund_of_transaction_id", None)) if getattr(tx, "refund_of_transaction_id", None) is not None else None,
        "note": tx.note,
        "tagIds": [int(x) for x in (tag_ids or [])],
        "tagNames": [str(x) for x in (tag_names or [])],
    }


def add_transaction_audit_log(
    db: Session,
    *,
    action: str,
    actor_user_id: int,
    target_user_id: int,
    transaction_id: int | None,
    tx_type: str | None,
    before: dict[str, Any] | None,
    after: dict[str, Any] | None,
) -> TransactionAuditLog:
    row = TransactionAuditLog(
        action=action,
        actor_user_id=int(actor_user_id),
        target_user_id=int(target_user_id),
        transaction_id=int(transaction_id) if transaction_id is not None else None,
        tx_type=str(tx_type) if tx_type is not None else None,
        before_json=json.dumps(before, ensure_ascii=False) if before is not None else None,
        after_json=json.dumps(after, ensure_ascii=False) if after is not None else None,
    )
    db.add(row)
    return row


def parse_snapshot(value: str | None) -> dict[str, Any] | None:
    if value is None:
        return None
    try:
        parsed = json.loads(value)
        if isinstance(parsed, dict):
            return parsed
        return {"value": parsed}
    except Exception:
        return {"raw": value}
