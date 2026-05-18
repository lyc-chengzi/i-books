from __future__ import annotations

from typing import Any
from datetime import datetime, timedelta, timezone

from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_access_token(subject: str) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.jwt_expire_minutes)
    to_encode = {"sub": subject, "exp": expire}
    return jwt.encode(to_encode, settings.jwt_secret, algorithm="HS256")


def decode_access_token_claims(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])


def get_access_token_expire_at(token: str) -> datetime:
    payload = decode_access_token_claims(token)
    exp = payload.get("exp")
    if isinstance(exp, datetime):
        if exp.tzinfo is None:
            return exp.replace(tzinfo=timezone.utc)
        return exp.astimezone(timezone.utc)
    if isinstance(exp, (int, float)):
        return datetime.fromtimestamp(exp, tz=timezone.utc)
    raise ValueError("Missing exp")


def decode_access_token(token: str) -> str:
    payload = decode_access_token_claims(token)
    sub = payload.get("sub")
    if not sub:
        raise ValueError("Missing sub")
    return str(sub)
