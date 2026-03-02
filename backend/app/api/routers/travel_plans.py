from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.travel_plan import TravelPlan
from app.models.user import User
from app.schemas.travel_plan import TravelPlanDayOut, TravelPlanMonthOut, TravelPlanUpsert

router = APIRouter(prefix="/tools/travel-plans", tags=["tools"])


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="Invalid month")

    start = date(year, month, 1)
    if month == 12:
        end = date(year + 1, 1, 1)
    else:
        end = date(year, month + 1, 1)
    return start, end


@router.get("", response_model=TravelPlanMonthOut)
def get_month(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TravelPlanMonthOut:
    start, end = _month_bounds(year, month)

    rows = db.scalars(
        select(TravelPlan)
        .where(
            TravelPlan.user_id == current_user.id,
            TravelPlan.plan_date >= start,
            TravelPlan.plan_date < end,
        )
        .order_by(TravelPlan.plan_date.asc(), TravelPlan.id.asc())
    ).all()

    items = [
        TravelPlanDayOut(date=r.plan_date, is_rest_day=bool(r.is_rest_day), am=r.am, pm=r.pm)
        for r in rows
    ]
    return TravelPlanMonthOut(year=year, month=month, items=items)


@router.put("", response_model=TravelPlanDayOut)
def upsert_day(
    payload: TravelPlanUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TravelPlanDayOut:
    is_rest_day = bool(payload.is_rest_day)
    am = (payload.am or "").strip() or None
    pm = (payload.pm or "").strip() or None

    if is_rest_day and (am is not None or pm is not None):
        raise HTTPException(status_code=400, detail="Rest day cannot have plans")

    existing = db.scalar(
        select(TravelPlan).where(
            TravelPlan.user_id == current_user.id,
            TravelPlan.plan_date == payload.date,
        )
    )

    if not is_rest_day and am is None and pm is None:
        if existing is not None:
            db.execute(
                delete(TravelPlan).where(
                    TravelPlan.user_id == current_user.id,
                    TravelPlan.plan_date == payload.date,
                )
            )
            db.commit()
        return TravelPlanDayOut(date=payload.date, is_rest_day=False, am=None, pm=None)

    now_utc_naive = datetime.now(timezone.utc).replace(tzinfo=None)

    if existing is None:
        row = TravelPlan(
            user_id=current_user.id,
            plan_date=payload.date,
            is_rest_day=is_rest_day,
            am=am,
            pm=pm,
            updated_at=now_utc_naive,
        )
        db.add(row)
    else:
        existing.is_rest_day = is_rest_day
        existing.am = am
        existing.pm = pm
        existing.updated_at = now_utc_naive

    db.commit()

    return TravelPlanDayOut(date=payload.date, is_rest_day=is_rest_day, am=am, pm=pm)
