from __future__ import annotations

from pydantic import BaseModel, Field


class UserOut(BaseModel):
    id: int
    username: str
    role: str
    isActive: bool
    timeZone: str


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=128)
    role: str = Field(default="user", pattern="^(admin|user)$")
    isActive: bool = True
    timeZone: str = "Asia/Shanghai"


class UserUpdate(BaseModel):
    password: str | None = Field(default=None, min_length=1, max_length=128)
    role: str | None = Field(default=None, pattern="^(admin|user)$")
    isActive: bool | None = None
    timeZone: str | None = None
