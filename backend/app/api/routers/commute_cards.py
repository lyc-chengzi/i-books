from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.commute_card import CommuteCard
from app.models.commute_reservation import CommuteReservation
from app.models.user import User
from app.schemas.commute_card import (
    CommuteCardCreate,
    CommuteCardListOut,
    CommuteCardOut,
    CommuteReservationCreate,
    CommuteReservationOut,
    CommuteReservationUpdate,
)

router = APIRouter(prefix="/tools/commute-cards", tags=["tools"])


def _utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _travel_slot_from_time(departure_time: str) -> str:
    hour = int(departure_time.split(":", 1)[0])
    return "am" if hour < 12 else "pm"


def _card_with_user_or_404(db: Session, current_user: User, card_id: int) -> CommuteCard:
    card = db.scalar(select(CommuteCard).where(CommuteCard.id == card_id, CommuteCard.user_id == current_user.id))
    if card is None:
        raise HTTPException(status_code=404, detail="Commute card not found")
    return card


def _reservation_with_user_or_404(db: Session, current_user: User, reservation_id: int) -> CommuteReservation:
    reservation = db.scalar(
        select(CommuteReservation).where(
            CommuteReservation.id == reservation_id,
            CommuteReservation.user_id == current_user.id,
        )
    )
    if reservation is None:
        raise HTTPException(status_code=404, detail="Reservation not found")
    return reservation


def _validate_card_trip_limit(db: Session, card: CommuteCard, exclude_reservation_id: int | None = None) -> None:
    count_query = select(func.count(CommuteReservation.id)).where(CommuteReservation.card_id == card.id)
    if exclude_reservation_id is not None:
        count_query = count_query.where(CommuteReservation.id != exclude_reservation_id)
    existing_count = int(db.scalar(count_query) or 0)
    if existing_count >= card.trip_count:
        raise HTTPException(status_code=400, detail="This commute card has no remaining trips")


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


def _validate_card_window(
    db: Session,
    *,
    card_id: int,
    proposed_date: date,
    exclude_reservation_id: int | None = None,
) -> None:
    query = select(CommuteReservation).where(CommuteReservation.card_id == card_id)
    if exclude_reservation_id is not None:
        query = query.where(CommuteReservation.id != exclude_reservation_id)

    rows = db.scalars(
        query.order_by(
            CommuteReservation.ride_date.asc(),
            CommuteReservation.departure_time.asc(),
            CommuteReservation.id.asc(),
        )
    ).all()

    dates = [reservation.ride_date for reservation in rows] + [proposed_date]
    if not dates:
        return

    effective_date = min(dates)
    expiry_date = effective_date + timedelta(days=29)
    if any(item_date > expiry_date for item_date in dates):
        raise HTTPException(status_code=400, detail="All reservations for the same commute card must stay within 30 days from the first reservation")


def _build_card_out(card: CommuteCard, reservations: list[CommuteReservation]) -> CommuteCardOut:
    reservation_out = [
        CommuteReservationOut(
            id=item.id,
            card_id=item.card_id,
            ride_date=item.ride_date,
            departure_time=item.departure_time,
            travel_slot=item.travel_slot,  # type: ignore[arg-type]
            direction=item.direction,  # type: ignore[arg-type]
            train_no=item.train_no,
            carriage_no=item.carriage_no,
            seat_no=item.seat_no,
            created_at=item.created_at,
        )
        for item in reservations
    ]

    effective_date = reservation_out[0].ride_date if reservation_out else None
    expiry_date = effective_date + timedelta(days=29) if effective_date else None
    used_count = len(reservation_out)
    remaining_count = max(0, card.trip_count - used_count)
    today = date.today()

    if not reservation_out:
        status_name = "draft"
    elif remaining_count == 0:
        status_name = "used-up"
    elif expiry_date is not None and expiry_date < today:
        status_name = "expired"
    else:
        status_name = "active"

    return CommuteCardOut(
        id=card.id,
        trip_count=card.trip_count,  # type: ignore[arg-type]
        created_at=card.created_at,
        effective_date=effective_date,
        expiry_date=expiry_date,
        used_count=used_count,
        remaining_count=remaining_count,
        status=status_name,  # type: ignore[arg-type]
        reservations=reservation_out,
    )


@router.get("", response_model=CommuteCardListOut)
def list_cards(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CommuteCardListOut:
    cards = db.scalars(
        select(CommuteCard)
        .where(CommuteCard.user_id == current_user.id)
        .order_by(CommuteCard.created_at.desc(), CommuteCard.id.desc())
    ).all()

    card_ids = [card.id for card in cards]
    if not card_ids:
        return CommuteCardListOut(items=[])

    reservations = db.scalars(
        select(CommuteReservation)
        .where(CommuteReservation.user_id == current_user.id)
        .where(CommuteReservation.card_id.in_(card_ids))
        .order_by(CommuteReservation.ride_date.asc(), CommuteReservation.departure_time.asc(), CommuteReservation.id.asc())
    ).all()

    reservation_map: dict[int, list[CommuteReservation]] = {card.id: [] for card in cards}
    for reservation in reservations:
        reservation_map.setdefault(reservation.card_id, []).append(reservation)

    return CommuteCardListOut(items=[_build_card_out(card, reservation_map.get(card.id, [])) for card in cards])


@router.post("", response_model=CommuteCardOut, status_code=status.HTTP_201_CREATED)
def create_card(
    payload: CommuteCardCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CommuteCardOut:
    row = CommuteCard(
        user_id=current_user.id,
        trip_count=payload.trip_count,
        created_at=(payload.created_at or _utc_now_naive()).replace(tzinfo=None),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _build_card_out(row, [])


@router.delete("/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_card(
    card_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    card = _card_with_user_or_404(db, current_user, card_id)
    has_reservations = db.scalar(select(func.count(CommuteReservation.id)).where(CommuteReservation.card_id == card.id))
    if int(has_reservations or 0) > 0:
        raise HTTPException(status_code=400, detail="Please delete all reservations before deleting this commute card")

    db.delete(card)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{card_id}/reservations", response_model=CommuteReservationOut, status_code=status.HTTP_201_CREATED)
def create_reservation(
    card_id: int,
    payload: CommuteReservationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CommuteReservationOut:
    card = _card_with_user_or_404(db, current_user, card_id)
    travel_slot = _travel_slot_from_time(payload.departure_time)

    _validate_card_trip_limit(db, card)
    _validate_slot_conflict(db, current_user=current_user, ride_date=payload.ride_date, travel_slot=travel_slot)
    _validate_card_window(db, card_id=card.id, proposed_date=payload.ride_date)

    row = CommuteReservation(
        user_id=current_user.id,
        card_id=card.id,
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


@router.patch("/reservations/{reservation_id}", response_model=CommuteReservationOut)
def update_reservation(
    reservation_id: int,
    payload: CommuteReservationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CommuteReservationOut:
    row = _reservation_with_user_or_404(db, current_user, reservation_id)
    card = _card_with_user_or_404(db, current_user, row.card_id)
    travel_slot = _travel_slot_from_time(payload.departure_time)

    _validate_slot_conflict(
        db,
        current_user=current_user,
        ride_date=payload.ride_date,
        travel_slot=travel_slot,
        exclude_reservation_id=row.id,
    )
    _validate_card_window(db, card_id=card.id, proposed_date=payload.ride_date, exclude_reservation_id=row.id)

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


@router.delete("/reservations/{reservation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reservation(
    reservation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    row = _reservation_with_user_or_404(db, current_user, reservation_id)
    db.delete(row)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)