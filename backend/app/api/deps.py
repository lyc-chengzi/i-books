from __future__ import annotations

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decode_access_token
from app.db.session import SessionLocal
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    request: Request,
    cred: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    token: str | None = None
    if cred and cred.credentials:
        token = cred.credentials
    else:
        token = request.cookies.get(settings.auth_cookie_name)

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        user_id = int(decode_access_token(token))
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User inactive")
    return user


def require_admin_user(current_user: User = Depends(get_current_user)) -> User:
    if getattr(current_user, "role", User.ROLE_USER) != User.ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Admin only")
    return current_user
