from __future__ import annotations

from pydantic import BaseModel, Field


class CategoryAmount(BaseModel):
    categoryId: int
    amountCents: int


class MonthAmount(BaseModel):
    month: str = Field(description="YYYY-MM")
    amountCents: int


class YearCategoryStatsOut(BaseModel):
    year: int
    type: str = Field(pattern="^(income|expense)$")
    totalCents: int
    breakdown: list[CategoryAmount]
    monthlyTotals: list[MonthAmount]


class MonthCategoryStatsOut(BaseModel):
    month: str = Field(description="YYYY-MM")
    type: str = Field(pattern="^(income|expense)$")
    totalCents: int
    breakdown: list[CategoryAmount]


class MonthlyInOut(BaseModel):
    month: str = Field(description="YYYY-MM")
    incomeCents: int
    expenseCents: int


class MonthlyRangeOut(BaseModel):
    startMonth: str = Field(description="YYYY-MM")
    endMonth: str = Field(description="YYYY-MM")
    series: list[MonthlyInOut]


class MonthCategoryCompare(BaseModel):
    categoryId: int
    currentCents: int
    previousCents: int


class YoYMonthlyPoint(BaseModel):
    month: str = Field(description="YYYY-MM")
    currentCents: int
    previousCents: int
    items: list[MonthCategoryCompare]


class YoYMonthlyStatsOut(BaseModel):
    type: str = Field(pattern="^(income|expense)$")
    currentLabel: str
    previousLabel: str
    series: list[YoYMonthlyPoint]
