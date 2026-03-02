from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


class TravelPlanDayOut(BaseModel):
    date: date
    is_rest_day: bool = False
    am: str | None = None
    pm: str | None = None


class TravelPlanMonthOut(BaseModel):
    year: int
    month: int = Field(ge=1, le=12)
    items: list[TravelPlanDayOut]


class TravelPlanUpsert(BaseModel):
    date: date
    is_rest_day: bool = False
    am: str | None = Field(default=None, max_length=500)
    pm: str | None = Field(default=None, max_length=500)
