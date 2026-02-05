from __future__ import annotations

from pydantic import BaseModel, Field


class CategoryCreate(BaseModel):
    type: str = Field(pattern="^(income|expense)$")
    name: str = Field(min_length=1)
    parentId: int | None = None
    sortOrder: int | None = None
    isActive: bool = True


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    sortOrder: int | None = None
    isActive: bool | None = None


class CategoryMove(BaseModel):
    parentId: int | None = None
    index: int = Field(ge=0)


class CategoryNodeOut(BaseModel):
    id: int
    type: str
    name: str
    parentId: int | None
    sortOrder: int
    isActive: bool
    isLeaf: bool
    children: list["CategoryNodeOut"] = Field(default_factory=list)
