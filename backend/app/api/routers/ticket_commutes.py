from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.commute_reservation import CommuteReservation
from app.models.user import User
from app.schemas.commute_card import (
    CommuteReservationCreate,
    CommuteReservationOut,
    CommuteReservationUpdate,
    TicketCommuteListOut,
)

router = APIRouter(prefix="/tools/ticket-commutes", tags=["tools"])


def _utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _travel_slot_from_time(departure_time: str) -> str:
    hour = int(departure_time.split(":", 1)[0])
    return "am" if hour < 12 else "pm"


def _reservation_with_user_or_404(db: Session, current_user: User, reservation_id: int) -> CommuteReservation:
    reservation = db.scalar(
        select(CommuteReservation).where(
            CommuteReservation.id == reservation_id,
            CommuteReservation.user_id == current_user.id,
            CommuteReservation.card_id.is_(None),
        )
    )
    if reservation is None:
        raise HTTPException(status_code=404, detail="Reservation not found")
    return reservation


def _validate_slot_conflict(
    db: Session,
    *,
    current_user: User,
    ride_date: date,
    travel_slot: str,
    exclude_reservation_id: int | None = None,
) -> None:
    query = select(CommuteReservation).where(
        CommuteReservation.user_id == current_user.id,
        CommuteReservation.ride_date == ride_date,
        CommuteReservation.travel_slot == travel_slot,
    )
    if exclude_reservation_id is not None:
        query = query.where(CommuteReservation.id != exclude_reservation_id)

    existing = db.scalar(query)
    if existing is not None:
        label = "上午" if travel_slot == "am" else "下午"
        raise HTTPException(status_code=400, detail=f"该日期的{label}已经有预约了")


def _to_out(row: CommuteReservation) -> CommuteReservationOut:
    return CommuteReservationOut(
        id=row.id,
        card_id=row.card_id,
        ride_date=row.ride_date,
        departure_time=row.departure_time,
        travel_slot=row.travel_slot,  # type: ignore[arg-type]
        direction=row.direction,  # type: ignore[arg-type]
        train_no=row.train_no,
        carriage_no=row.carriage_no,
        seat_no=row.seat_no,
        created_at=row.created_at,
    )


@router.get("", response_model=TicketCommuteListOut)
def list_ticket_commutes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TicketCommuteListOut:
    rows = db.scalars(
        select(CommuteReservation)
        .where(
            CommuteReservation.user_id == current_user.id,
            CommuteReservation.card_id.is_(None),
        )
        .order_by(CommuteReservation.ride_date.asc(), CommuteReservation.departure_time.asc(), CommuteReservation.id.asc())
    ).all()
    return TicketCommuteListOut(items=[_to_out(row) for row in rows])


@router.post("/reservations", response_model=CommuteReservationOut, status_code=status.HTTP_201_CREATED)
def create_ticket_commute(
    payload: CommuteReservationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CommuteReservationOut:
    travel_slot = _travel_slot_from_time(payload.departure_time)
    _validate_slot_conflict(db, current_user=current_user, ride_date=payload.ride_date, travel_slot=travel_slot)

    row = CommuteReservation(
        user_id=current_user.id,
        card_id=None,
        ride_date=payload.ride_date,
        departure_time=payload.departure_time,
        travel_slot=travel_slot,
        direction=payload.direction,
        train_no=payload.train_no,
        carriage_no=payload.carriage_no,
        seat_no=payload.seat_no,
        updated_at=_utc_now_naive(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.patch("/reservations/{reservation_id}", response_model=CommuteReservationOut)
def update_ticket_commute(
    reservation_id: int,
    payload: CommuteReservationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CommuteReservationOut:
    row = _reservation_with_user_or_404(db, current_user, reservation_id)
    travel_slot = _travel_slot_from_time(payload.departure_time)
    _validate_slot_conflict(
        db,
        current_user=current_user,
        ride_date=payload.ride_date,
        travel_slot=travel_slot,
        exclude_reservation_id=row.id,
    )

    row.ride_date = payload.ride_date
    row.departure_time = payload.departure_time
    row.travel_slot = travel_slot
    row.direction = payload.direction
    row.train_no = payload.train_no
    row.carriage_no = payload.carriage_no
    row.seat_no = payload.seat_no
    row.updated_at = _utc_now_naive()

    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.delete("/reservations/{reservation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ticket_commute(
    reservation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    row = _reservation_with_user_or_404(db, current_user, reservation_id)
    db.delete(row)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)