from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.account_item import AccountItem
from app.models.user import User
from app.schemas.account_item import AccountItemCreate, AccountItemOut

router = APIRouter(prefix="/config/account-items", tags=["config"])


@router.get("", response_model=list[AccountItemOut])
def list_account_items(
    type: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AccountItemOut]:
    stmt = select(AccountItem).where(AccountItem.user_id == current_user.id)
    if type:
        stmt = stmt.where(AccountItem.type == type)
    rows = db.scalars(stmt.order_by(AccountItem.id.desc())).all()
    return [
        AccountItemOut(id=r.id, type=r.type, name=r.name, path=r.path, isActive=r.is_active)
        for r in rows
    ]


@router.post("", response_model=AccountItemOut)
def create_account_item(
    payload: AccountItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AccountItemOut:
    if payload.type not in ("income", "expense"):
        raise HTTPException(status_code=400, detail="Invalid type")

    row = AccountItem(
        user_id=current_user.id,
        type=payload.type,
        name=payload.name,
        path=payload.path,
        is_active=payload.isActive,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return AccountItemOut(id=row.id, type=row.type, name=row.name, path=row.path, isActive=row.is_active)
