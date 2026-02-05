from __future__ import annotations

from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str


class RegisterRequest(BaseModel):
    username: str
    password: str


class UserMe(BaseModel):
    id: int
    username: str
