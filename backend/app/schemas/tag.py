from __future__ import annotations

from pydantic import BaseModel, Field


class CategoryTagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    isActive: bool = True


class CategoryTagOut(BaseModel):
    id: int
    categoryId: int
    name: str
    isActive: bool
