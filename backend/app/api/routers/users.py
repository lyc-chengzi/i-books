from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin_user
from app.core.security import hash_password
from app.models.user import User
from app.schemas.user import UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/config/users", tags=["config"])


def _ensure_role(value: str | None) -> str | None:
    if value is None:
        return None
    if value not in (User.ROLE_ADMIN, User.ROLE_USER):
        raise HTTPException(status_code=400, detail="Invalid role")
    return value


@router.get("", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_user),
) -> list[UserOut]:
    rows = db.scalars(select(User).order_by(User.id.desc())).all()
    return [
        UserOut(
            id=r.id,
            username=r.username,
            role=getattr(r, "role", User.ROLE_USER),
            isActive=r.is_active,
            timeZone=r.time_zone,
        )
        for r in rows
    ]


@router.post("", response_model=UserOut)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_user),
) -> UserOut:
    existing = db.scalar(select(User).where(User.username == payload.username))
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    role = _ensure_role(payload.role) or User.ROLE_USER

    row = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        role=role,
        is_active=payload.isActive,
        time_zone=payload.timeZone,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return UserOut(
        id=row.id,
        username=row.username,
        role=row.role,
        isActive=row.is_active,
        timeZone=row.time_zone,
    )


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin_user),
) -> UserOut:
    row = db.get(User, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    next_role = _ensure_role(payload.role) if payload.role is not None else getattr(row, "role", User.ROLE_USER)
    next_active = payload.isActive if payload.isActive is not None else row.is_active

    # Safety: avoid locking yourself out from admin.
    if row.id == current_admin.id:
        if next_role != User.ROLE_ADMIN:
            raise HTTPException(status_code=400, detail="Cannot change your own role")
        if next_active is False:
            raise HTTPException(status_code=400, detail="Cannot disable your own account")

    # Safety: keep at least one active admin.
    if (getattr(row, "role", User.ROLE_USER) == User.ROLE_ADMIN and (next_role != User.ROLE_ADMIN or not next_active)):
        active_admin_count = db.scalar(
            select(func.count(User.id)).where(User.role == User.ROLE_ADMIN, User.is_active == True)  # noqa: E712
        )
        if active_admin_count is not None and int(active_admin_count) <= 1:
            raise HTTPException(status_code=400, detail="At least one active admin is required")

    if payload.password is not None:
        row.password_hash = hash_password(payload.password)

    if payload.role is not None:
        row.role = next_role

    if payload.isActive is not None:
        row.is_active = payload.isActive

    if payload.timeZone is not None:
        row.time_zone = payload.timeZone

    db.add(row)
    db.commit()
    db.refresh(row)

    return UserOut(
        id=row.id,
        username=row.username,
        role=getattr(row, "role", User.ROLE_USER),
        isActive=row.is_active,
        timeZone=row.time_zone,
    )
