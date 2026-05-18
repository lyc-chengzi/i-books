from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    access_token_expires_at: datetime


class RegisterRequest(BaseModel):
    username: str
    password: str


class UserMe(BaseModel):
    id: int
    username: str
    role: str


class SessionMe(UserMe):
    access_token_expires_at: datetime
