from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin_user
from app.core.audit_log import parse_snapshot
from app.core.datetime_utils import as_utc, to_utc_naive
from app.models.transaction_audit_log import TransactionAuditLog
from app.models.user import User
from app.schemas.transaction_audit_log import TransactionAuditLogListOut, TransactionAuditLogOut

router = APIRouter(prefix="/admin/transaction-audit-logs", tags=["admin"])


@router.get("", response_model=TransactionAuditLogListOut)
def list_transaction_audit_logs(
    page: int = 1,
    pageSize: int = 50,
    order: str = "asc",
    action: str | None = None,
    transactionId: int | None = None,
    txType: str | None = None,
    actorUserId: int | None = None,
    targetUserId: int | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_user),
) -> TransactionAuditLogListOut:
    if page < 1:
        raise HTTPException(status_code=400, detail="Invalid page")
    if pageSize < 1 or pageSize > 200:
        raise HTTPException(status_code=400, detail="Invalid pageSize")

    if action is not None and action not in ("create", "update", "delete"):
        raise HTTPException(status_code=400, detail="Invalid action")
    if txType is not None and txType not in ("income", "expense", "transfer", "refund"):
        raise HTTPException(status_code=400, detail="Invalid txType")
    if order not in ("asc", "desc"):
        raise HTTPException(status_code=400, detail="Invalid order")

    filters: list = []
    if action is not None:
        filters.append(TransactionAuditLog.action == action)
    if transactionId is not None:
        filters.append(TransactionAuditLog.transaction_id == transactionId)
    if txType is not None:
        filters.append(TransactionAuditLog.tx_type == txType)
    if actorUserId is not None:
        filters.append(TransactionAuditLog.actor_user_id == actorUserId)
    if targetUserId is not None:
        filters.append(TransactionAuditLog.target_user_id == targetUserId)
    if start is not None:
        filters.append(TransactionAuditLog.created_at >= to_utc_naive(start))
    if end is not None:
        filters.append(TransactionAuditLog.created_at <= to_utc_naive(end))

    base = select(TransactionAuditLog).where(*filters)
    total = int(db.scalar(select(func.count()).select_from(base.subquery())) or 0)

    order_by = (
        (TransactionAuditLog.created_at.asc(), TransactionAuditLog.id.asc())
        if order == "asc"
        else (TransactionAuditLog.created_at.desc(), TransactionAuditLog.id.desc())
    )

    rows = db.scalars(base.order_by(*order_by).offset((page - 1) * pageSize).limit(pageSize)).all()

    items = [
        TransactionAuditLogOut(
            id=int(r.id),
            action=str(r.action),
            actorUserId=int(r.actor_user_id),
            targetUserId=int(r.target_user_id),
            transactionId=int(r.transaction_id) if r.transaction_id is not None else None,
            txType=str(r.tx_type) if r.tx_type is not None else None,
            createdAt=as_utc(r.created_at),
            before=parse_snapshot(r.before_json),
            after=parse_snapshot(r.after_json),
        )
        for r in rows
    ]

    return TransactionAuditLogListOut(items=items, total=total)
