from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.core.datetime_utils import to_utc_naive
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.stats import (
    MonthCategoryCompare,
    MonthlyInOut,
    MonthlyRangeOut,
    YearCategoryStatsOut,
    YoYMonthlyPoint,
    YoYMonthlyStatsOut,
)

router = APIRouter(prefix="/stats", tags=["stats"])


def _year_bounds_utc_naive(year: int) -> tuple[datetime, datetime]:
    if year < 1970 or year > 2100:
        raise HTTPException(status_code=400, detail="Invalid year")
    start = datetime(year, 1, 1)
    end = datetime(year + 1, 1, 1)
    return start, end


def _month_bounds_utc_naive(year: int, month: int) -> tuple[datetime, datetime]:
    if year < 1970 or year > 2100:
        raise HTTPException(status_code=400, detail="Invalid year")
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="Invalid month")

    start = datetime(year, month, 1)
    if month == 12:
        end = datetime(year + 1, 1, 1)
    else:
        end = datetime(year, month + 1, 1)
    return start, end


def _parse_yyyy_mm(value: str) -> tuple[int, int]:
    try:
        y, m = value.split("-")
        return int(y), int(m)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid month format (YYYY-MM)")


@router.get("/year-category", response_model=YearCategoryStatsOut)
def year_category_stats(
    year: int,
    type: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> YearCategoryStatsOut:
    if type not in ("income", "expense"):
        raise HTTPException(status_code=400, detail="Invalid type")

    start, end = _year_bounds_utc_naive(year)

    breakdown_rows = db.execute(
        select(Transaction.category_id, func.coalesce(func.sum(Transaction.amount_cents), 0))
        .where(
            Transaction.user_id == current_user.id,
            Transaction.type == type,
            Transaction.category_id.is_not(None),
            Transaction.occurred_at >= to_utc_naive(start),
            Transaction.occurred_at < to_utc_naive(end),
        )
        .group_by(Transaction.category_id)
    ).all()

    breakdown = [
        {"categoryId": int(category_id), "amountCents": int(amount)}
        for category_id, amount in breakdown_rows
        if category_id is not None
    ]

    # Monthly totals (YYYY-MM)
    year_key = func.year(Transaction.occurred_at)
    month_key = func.month(Transaction.occurred_at)
    monthly_rows = db.execute(
        select(year_key, month_key, func.coalesce(func.sum(Transaction.amount_cents), 0))
        .where(
            Transaction.user_id == current_user.id,
            Transaction.type == type,
            Transaction.occurred_at >= to_utc_naive(start),
            Transaction.occurred_at < to_utc_naive(end),
        )
        .group_by(year_key, month_key)
        .order_by(year_key.asc(), month_key.asc())
    ).all()

    monthly_totals = []
    total_cents = 0
    for y, m, amount in monthly_rows:
        if y is None or m is None:
            continue
        month_str = f"{int(y):04d}-{int(m):02d}"
        amt = int(amount or 0)
        monthly_totals.append({"month": month_str, "amountCents": amt})
        total_cents += amt

    # If no monthly rows (e.g. no tx), still compute total from breakdown
    if not monthly_totals:
        total_cents = sum(int(x["amountCents"]) for x in breakdown)

    return YearCategoryStatsOut(
        year=year,
        type=type,
        totalCents=total_cents,
        breakdown=breakdown,
        monthlyTotals=monthly_totals,
    )


@router.get("/yoy-monthly", response_model=YoYMonthlyStatsOut)
def yoy_monthly_stats(
    year: int,
    type: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> YoYMonthlyStatsOut:
    if type not in ("income", "expense"):
        raise HTTPException(status_code=400, detail="Invalid type")

    cur_start, cur_end = _year_bounds_utc_naive(year)
    prev_start, _prev_end = _year_bounds_utc_naive(year - 1)

    year_key = func.year(Transaction.occurred_at)
    month_key = func.month(Transaction.occurred_at)

    rows = db.execute(
        select(
            year_key,
            month_key,
            Transaction.category_id,
            func.coalesce(func.sum(Transaction.amount_cents), 0),
        )
        .where(
            Transaction.user_id == current_user.id,
            Transaction.type == type,
            Transaction.category_id.is_not(None),
            Transaction.occurred_at >= to_utc_naive(prev_start),
            Transaction.occurred_at < to_utc_naive(cur_end),
        )
        .group_by(year_key, month_key, Transaction.category_id)
        .order_by(year_key.asc(), month_key.asc())
    ).all()

    # Build per-month maps for current and previous year (month index 1..12)
    cur_month_maps: dict[int, dict[int, int]] = {m: {} for m in range(1, 13)}
    prev_month_maps: dict[int, dict[int, int]] = {m: {} for m in range(1, 13)}

    for y, m, category_id, amount in rows:
        if y is None or m is None or category_id is None:
            continue
        mm = int(m)
        if mm < 1 or mm > 12:
            continue
        cid = int(category_id)
        amt = int(amount or 0)
        if int(y) == year:
            cur_month_maps[mm][cid] = cur_month_maps[mm].get(cid, 0) + amt
        elif int(y) == year - 1:
            prev_month_maps[mm][cid] = prev_month_maps[mm].get(cid, 0) + amt

    series: list[YoYMonthlyPoint] = []
    for mm in range(1, 13):
        cur_map = cur_month_maps.get(mm, {})
        prev_map = prev_month_maps.get(mm, {})
        keys = sorted(set(cur_map.keys()) | set(prev_map.keys()))
        items = [
            MonthCategoryCompare(
                categoryId=k,
                currentCents=int(cur_map.get(k, 0)),
                previousCents=int(prev_map.get(k, 0)),
            )
            for k in keys
        ]
        items.sort(key=lambda x: (x.currentCents + x.previousCents, x.currentCents), reverse=True)
        series.append(
            YoYMonthlyPoint(
                month=f"{year:04d}-{mm:02d}",
                currentCents=int(sum(cur_map.values())),
                previousCents=int(sum(prev_map.values())),
                items=items,
            )
        )

    return YoYMonthlyStatsOut(
        type=type,
        currentLabel=str(year),
        previousLabel=str(year - 1),
        series=series,
    )


@router.get("/monthly-range", response_model=MonthlyRangeOut)
def monthly_range(
    startMonth: str,
    endMonth: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MonthlyRangeOut:
    sy, sm = _parse_yyyy_mm(startMonth)
    ey, em = _parse_yyyy_mm(endMonth)

    start, _ = _month_bounds_utc_naive(sy, sm)
    end, _end2 = _month_bounds_utc_naive(ey, em)
    # end should be start of next month
    if em == 12:
        end = datetime(ey + 1, 1, 1)
    else:
        end = datetime(ey, em + 1, 1)

    if to_utc_naive(end) <= to_utc_naive(start):
        raise HTTPException(status_code=400, detail="Invalid month range")

    year_key = func.year(Transaction.occurred_at)
    month_key = func.month(Transaction.occurred_at)

    rows = db.execute(
        select(
            year_key,
            month_key,
            Transaction.type,
            func.coalesce(func.sum(Transaction.amount_cents), 0),
        )
        .where(
            Transaction.user_id == current_user.id,
            Transaction.type.in_(["income", "expense"]),
            Transaction.occurred_at >= to_utc_naive(start),
            Transaction.occurred_at < to_utc_naive(end),
        )
        .group_by(year_key, month_key, Transaction.type)
        .order_by(year_key.asc(), month_key.asc())
    ).all()

    # Fill month buckets
    series_map: dict[str, MonthlyInOut] = {}
    cursor_y, cursor_m = sy, sm
    while True:
        key = f"{cursor_y:04d}-{cursor_m:02d}"
        series_map[key] = MonthlyInOut(month=key, incomeCents=0, expenseCents=0)
        if cursor_y == ey and cursor_m == em:
            break
        if cursor_m == 12:
            cursor_y += 1
            cursor_m = 1
        else:
            cursor_m += 1

    for y, m, t, amount in rows:
        if y is None or m is None:
            continue
        month_str = f"{int(y):04d}-{int(m):02d}"
        bucket = series_map.get(month_str)
        if not bucket:
            continue
        amt = int(amount or 0)
        if t == "income":
            bucket.incomeCents = amt
        elif t == "expense":
            bucket.expenseCents = amt

    return MonthlyRangeOut(
        startMonth=startMonth,
        endMonth=endMonth,
        series=list(series_map.values()),
    )
