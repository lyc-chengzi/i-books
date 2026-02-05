from __future__ import annotations

from pydantic import BaseModel, Field


class AccountItemCreate(BaseModel):
    type: str = Field(pattern="^(income|expense)$")
    name: str = Field(min_length=1)
    path: str = Field(min_length=1)
    isActive: bool = True


class AccountItemOut(BaseModel):
    id: int
    type: str
    name: str
    path: str
    isActive: bool
