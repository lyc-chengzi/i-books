from __future__ import annotations

from datetime import datetime, timedelta, timezone, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, aliased

from app.api.deps import get_current_user, get_db
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.stats import (
    ExpenseItemStatsOut,
    MonthCategoryCompare,
    MonthCategoryStatsOut,
    MoMStatsOut,
    MonthlyInOut,
    MonthlyRangeOut,
    YearCategoryStatsOut,
    YoYMonthlyPoint,
    YoYMonthlyStatsOut,
)

router = APIRouter(prefix="/stats", tags=["stats"])


def _descendant_category_ids(db: Session, user_id: int, root_id: int) -> set[int]:
    root = db.get(Category, root_id)
    if not root or root.user_id != user_id:
        raise HTTPException(status_code=404, detail="Category not found")
    if root.type != "expense":
        raise HTTPException(status_code=400, detail="Only expense categories are supported")

    rows = db.execute(
        select(Category.id, Category.parent_id).where(
            Category.user_id == user_id,
            Category.type == "expense",
        )
    ).all()

    children: dict[int | None, list[int]] = {}
    for cid, pid in rows:
        children.setdefault(pid, []).append(int(cid))

    out: set[int] = set()
    stack: list[int] = [int(root_id)]
    while stack:
        cur = stack.pop()
        if cur in out:
            continue
        out.add(cur)
        for child_id in children.get(cur, []):
            stack.append(int(child_id))

    return out


def _merge_net(expense_rows: list[tuple], refund_rows: list[tuple]) -> dict[tuple, int]:
    expense_map: dict[tuple, int] = {tuple(k): int(v or 0) for *k, v in expense_rows}
    refund_map: dict[tuple, int] = {tuple(k): int(v or 0) for *k, v in refund_rows}
    out: dict[tuple, int] = {}
    for k, v in expense_map.items():
        out[k] = int(v) - int(refund_map.get(k, 0))
    return out


def _user_zone(current_user: User) -> tzinfo:
    try:
        return ZoneInfo(current_user.time_zone or "Asia/Shanghai")
    except ZoneInfoNotFoundError:
        return timezone(timedelta(hours=8))


def _local_datetime_to_utc_naive(dt: datetime, user_zone: tzinfo) -> datetime:
    return dt.replace(tzinfo=user_zone).astimezone(timezone.utc).replace(tzinfo=None)


def _year_bounds_utc_naive(year: int, user_zone: tzinfo) -> tuple[datetime, datetime]:
    if year < 1970 or year > 2100:
        raise HTTPException(status_code=400, detail="Invalid year")
    start = datetime(year, 1, 1)
    end = datetime(year + 1, 1, 1)
    return _local_datetime_to_utc_naive(start, user_zone), _local_datetime_to_utc_naive(end, user_zone)


def _month_bounds_utc_naive(year: int, month: int, user_zone: tzinfo) -> tuple[datetime, datetime]:
    if year < 1970 or year > 2100:
        raise HTTPException(status_code=400, detail="Invalid year")
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="Invalid month")

    start = datetime(year, month, 1)
    if month == 12:
        end = datetime(year + 1, 1, 1)
    else:
        end = datetime(year, month + 1, 1)
    return _local_datetime_to_utc_naive(start, user_zone), _local_datetime_to_utc_naive(end, user_zone)


def _next_month(year: int, month: int) -> tuple[int, int]:
    if month == 12:
        return year + 1, 1
    return year, month + 1


def _sum_type_period(
    db: Session,
    user_id: int,
    type: str,
    start: datetime,
    end: datetime,
) -> int:
    if type == "income":
        return int(
            db.scalar(
                select(func.coalesce(func.sum(Transaction.amount_cents), 0)).where(
                    Transaction.user_id == user_id,
                    Transaction.type == "income",
                    Transaction.occurred_at >= start,
                    Transaction.occurred_at < end,
                )
            )
            or 0
        )

    expense = aliased(Transaction)
    refund = aliased(Transaction)
    expense_sum = int(
        db.scalar(
            select(func.coalesce(func.sum(expense.amount_cents), 0)).where(
                expense.user_id == user_id,
                expense.type == "expense",
                expense.occurred_at >= start,
                expense.occurred_at < end,
            )
        )
        or 0
    )
    refund_sum = int(
        db.scalar(
            select(func.coalesce(func.sum(refund.amount_cents), 0))
            .select_from(refund)
            .join(expense, refund.refund_of_transaction_id == expense.id)
            .where(
                refund.user_id == user_id,
                refund.type == "refund",
                expense.user_id == user_id,
                expense.type == "expense",
                expense.occurred_at >= start,
                expense.occurred_at < end,
            )
        )
        or 0
    )
    return max(0, expense_sum - refund_sum)


def _category_rows_for_period(
    db: Session,
    user_id: int,
    type: str,
    start: datetime,
    end: datetime,
) -> list[tuple[int, int]]:
    if type == "income":
        rows = db.execute(
            select(Transaction.category_id, func.coalesce(func.sum(Transaction.amount_cents), 0))
            .where(
                Transaction.user_id == user_id,
                Transaction.type == "income",
                Transaction.category_id.is_not(None),
                Transaction.occurred_at >= start,
                Transaction.occurred_at < end,
            )
            .group_by(Transaction.category_id)
        ).all()
        return [(int(cid), int(amt or 0)) for cid, amt in rows if cid is not None]

    expense = aliased(Transaction)
    refund = aliased(Transaction)
    expense_rows = db.execute(
        select(expense.category_id, func.coalesce(func.sum(expense.amount_cents), 0))
        .where(
            expense.user_id == user_id,
            expense.type == "expense",
            expense.category_id.is_not(None),
            expense.occurred_at >= start,
            expense.occurred_at < end,
        )
        .group_by(expense.category_id)
    ).all()
    refund_rows = db.execute(
        select(expense.category_id, func.coalesce(func.sum(refund.amount_cents), 0))
        .select_from(refund)
        .join(expense, refund.refund_of_transaction_id == expense.id)
        .where(
            refund.user_id == user_id,
            refund.type == "refund",
            expense.user_id == user_id,
            expense.type == "expense",
            expense.category_id.is_not(None),
            expense.occurred_at >= start,
            expense.occurred_at < end,
        )
        .group_by(expense.category_id)
    ).all()
    expense_kv = [(int(cid), int(amt or 0)) for cid, amt in expense_rows if cid is not None]
    refund_kv = [(int(cid), int(amt or 0)) for cid, amt in refund_rows if cid is not None]
    net_map = _merge_net(expense_kv, refund_kv)
    return [(cid, max(0, int(net_amt or 0))) for (cid,), net_amt in net_map.items()]


def _parse_yyyy_mm(value: str) -> tuple[int, int]:
    try:
        y, m = value.split("-")
        return int(y), int(m)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid month format (YYYY-MM)")


@router.get("/expense-item", response_model=ExpenseItemStatsOut)
def expense_item_stats(
    categoryId: int,
    year: int,
    month: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ExpenseItemStatsOut:
    category_ids = _descendant_category_ids(db, current_user.id, int(categoryId))
    user_zone = _user_zone(current_user)

    scope = "year"
    if month is None:
        start, end = _year_bounds_utc_naive(year, user_zone)
    else:
        scope = "month"
        start, end = _month_bounds_utc_naive(year, int(month), user_zone)

    expense = aliased(Transaction)
    refund = aliased(Transaction)

    expense_sum = db.scalar(
        select(func.coalesce(func.sum(expense.amount_cents), 0)).where(
            expense.user_id == current_user.id,
            expense.type == "expense",
            expense.category_id.in_(category_ids),
            expense.occurred_at >= start,
            expense.occurred_at < end,
        )
    )

    refund_sum = db.scalar(
        select(func.coalesce(func.sum(refund.amount_cents), 0))
        .select_from(refund)
        .join(expense, refund.refund_of_transaction_id == expense.id)
        .where(
            refund.user_id == current_user.id,
            refund.type == "refund",
            expense.user_id == current_user.id,
            expense.type == "expense",
            expense.category_id.in_(category_ids),
            expense.occurred_at >= start,
            expense.occurred_at < end,
        )
    )

    expense_rows = db.execute(
        select(expense.category_id, func.coalesce(func.sum(expense.amount_cents), 0))
        .where(
            expense.user_id == current_user.id,
            expense.type == "expense",
            expense.category_id.is_not(None),
            expense.category_id.in_(category_ids),
            expense.occurred_at >= start,
            expense.occurred_at < end,
        )
        .group_by(expense.category_id)
    ).all()

    refund_rows = db.execute(
        select(expense.category_id, func.coalesce(func.sum(refund.amount_cents), 0))
        .select_from(refund)
        .join(expense, refund.refund_of_transaction_id == expense.id)
        .where(
            refund.user_id == current_user.id,
            refund.type == "refund",
            expense.user_id == current_user.id,
            expense.type == "expense",
            expense.category_id.is_not(None),
            expense.category_id.in_(category_ids),
            expense.occurred_at >= start,
            expense.occurred_at < end,
        )
        .group_by(expense.category_id)
    ).all()

    expense_kv = [(int(cid), int(amt or 0)) for cid, amt in expense_rows if cid is not None]
    refund_kv = [(int(cid), int(amt or 0)) for cid, amt in refund_rows if cid is not None]
    net_map = _merge_net(expense_kv, refund_kv)
    breakdown = [
        {"categoryId": int(cid), "amountCents": max(0, int(net_amt or 0))}
        for (cid,), net_amt in net_map.items()
    ]
    breakdown.sort(key=lambda x: int(x["amountCents"]), reverse=True)

    expense_cents = int(expense_sum or 0)
    refund_cents = int(refund_sum or 0)
    net_cents = max(0, expense_cents - refund_cents)

    return ExpenseItemStatsOut(
        scope=scope,
        year=year,
        month=int(month) if month is not None else None,
        categoryId=int(categoryId),
        expenseCents=expense_cents,
        refundCents=refund_cents,
        netCents=net_cents,
        totalCents=net_cents,
        breakdown=breakdown,
    )


@router.get("/year-category", response_model=YearCategoryStatsOut)
def year_category_stats(
    year: int,
    type: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> YearCategoryStatsOut:
    if type not in ("income", "expense"):
        raise HTTPException(status_code=400, detail="Invalid type")

    user_zone = _user_zone(current_user)
    start, end = _year_bounds_utc_naive(year, user_zone)

    if type == "income":
        breakdown_rows = db.execute(
            select(Transaction.category_id, func.coalesce(func.sum(Transaction.amount_cents), 0))
            .where(
                Transaction.user_id == current_user.id,
                Transaction.type == "income",
                Transaction.category_id.is_not(None),
                Transaction.occurred_at >= start,
                Transaction.occurred_at < end,
            )
            .group_by(Transaction.category_id)
        ).all()
    else:
        expense = aliased(Transaction)
        refund = aliased(Transaction)

        expense_rows = db.execute(
            select(expense.category_id, func.coalesce(func.sum(expense.amount_cents), 0))
            .where(
                expense.user_id == current_user.id,
                expense.type == "expense",
                expense.category_id.is_not(None),
                expense.occurred_at >= start,
                expense.occurred_at < end,
            )
            .group_by(expense.category_id)
        ).all()
        refund_rows = db.execute(
            select(expense.category_id, func.coalesce(func.sum(refund.amount_cents), 0))
            .select_from(refund)
            .join(expense, refund.refund_of_transaction_id == expense.id)
            .where(
                refund.user_id == current_user.id,
                refund.type == "refund",
                expense.user_id == current_user.id,
                expense.type == "expense",
                expense.category_id.is_not(None),
                expense.occurred_at >= start,
                expense.occurred_at < end,
            )
            .group_by(expense.category_id)
        ).all()

        expense_kv = [(int(cid), int(amt or 0)) for cid, amt in expense_rows if cid is not None]
        refund_kv = [(int(cid), int(amt or 0)) for cid, amt in refund_rows if cid is not None]
        net_map = _merge_net(expense_kv, refund_kv)
        breakdown_rows = [(cid, max(0, int(net_amt or 0))) for (cid,), net_amt in net_map.items()]

    breakdown = [
        {"categoryId": int(category_id), "amountCents": int(amount)}
        for category_id, amount in breakdown_rows
        if category_id is not None
    ]

    monthly_totals = []
    total_cents = 0
    for month_index in range(1, 13):
        month_start, month_end = _month_bounds_utc_naive(year, month_index, user_zone)
        amt = _sum_type_period(db, current_user.id, type, month_start, month_end)
        if amt > 0:
            monthly_totals.append({"month": f"{year:04d}-{month_index:02d}", "amountCents": amt})
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

    user_zone = _user_zone(current_user)
    cur_month_maps: dict[int, dict[int, int]] = {m: {} for m in range(1, 13)}
    prev_month_maps: dict[int, dict[int, int]] = {m: {} for m in range(1, 13)}

    for month_index in range(1, 13):
        cur_start, cur_end = _month_bounds_utc_naive(year, month_index, user_zone)
        prev_start, prev_end = _month_bounds_utc_naive(year - 1, month_index, user_zone)
        cur_month_maps[month_index] = dict(
            _category_rows_for_period(db, current_user.id, type, cur_start, cur_end)
        )
        prev_month_maps[month_index] = dict(
            _category_rows_for_period(db, current_user.id, type, prev_start, prev_end)
        )

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


@router.get("/mom", response_model=MoMStatsOut)
def mom_stats(
    year: int,
    month: int,
    type: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MoMStatsOut:
    if type not in ("income", "expense"):
        raise HTTPException(status_code=400, detail="Invalid type")

    user_zone = _user_zone(current_user)
    current_start, current_end = _month_bounds_utc_naive(year, month, user_zone)
    if month == 1:
        previous_year, previous_month = year - 1, 12
    else:
        previous_year, previous_month = year, month - 1
    previous_start, previous_end = _month_bounds_utc_naive(previous_year, previous_month, user_zone)

    current_map = dict(
        _category_rows_for_period(db, current_user.id, type, current_start, current_end)
    )
    previous_map = dict(
        _category_rows_for_period(db, current_user.id, type, previous_start, previous_end)
    )

    keys = sorted(set(current_map.keys()) | set(previous_map.keys()))
    items = [
        MonthCategoryCompare(
            categoryId=category_id,
            currentCents=int(current_map.get(category_id, 0)),
            previousCents=int(previous_map.get(category_id, 0)),
        )
        for category_id in keys
    ]
    items.sort(key=lambda x: (x.currentCents + x.previousCents, x.currentCents), reverse=True)

    return MoMStatsOut(
        type=type,
        currentLabel=f"{year:04d}-{month:02d}",
        previousLabel=f"{previous_year:04d}-{previous_month:02d}",
        currentTotalCents=_sum_type_period(db, current_user.id, type, current_start, current_end),
        previousTotalCents=_sum_type_period(db, current_user.id, type, previous_start, previous_end),
        items=items,
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

    user_zone = _user_zone(current_user)
    start, _ = _month_bounds_utc_naive(sy, sm, user_zone)
    _, end = _month_bounds_utc_naive(ey, em, user_zone)

    if end <= start:
        raise HTTPException(status_code=400, detail="Invalid month range")

    series_map: dict[str, MonthlyInOut] = {}
    cursor_y, cursor_m = sy, sm
    while True:
        key = f"{cursor_y:04d}-{cursor_m:02d}"
        month_start, month_end = _month_bounds_utc_naive(cursor_y, cursor_m, user_zone)
        series_map[key] = MonthlyInOut(
            month=key,
            incomeCents=_sum_type_period(db, current_user.id, "income", month_start, month_end),
            expenseCents=_sum_type_period(db, current_user.id, "expense", month_start, month_end),
        )
        if cursor_y == ey and cursor_m == em:
            break
        cursor_y, cursor_m = _next_month(cursor_y, cursor_m)

    return MonthlyRangeOut(
        startMonth=startMonth,
        endMonth=endMonth,
        series=list(series_map.values()),
    )


@router.get("/month-category", response_model=MonthCategoryStatsOut)
def month_category_stats(
    month: str,
    type: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MonthCategoryStatsOut:
    if type not in ("income", "expense"):
        raise HTTPException(status_code=400, detail="Invalid type")

    y, m = _parse_yyyy_mm(month)
    user_zone = _user_zone(current_user)
    start, end = _month_bounds_utc_naive(y, m, user_zone)
    rows = _category_rows_for_period(db, current_user.id, type, start, end)

    breakdown = [
        {"categoryId": int(category_id), "amountCents": int(amount)}
        for category_id, amount in rows
        if category_id is not None
    ]
    total_cents = sum(int(x["amountCents"]) for x in breakdown)

    return MonthCategoryStatsOut(
        month=month,
        type=type,
        totalCents=total_cents,
        breakdown=breakdown,
    )
