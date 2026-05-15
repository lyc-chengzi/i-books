from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


Direction = Literal["北京南-天津", "天津-北京南"]
TravelSlot = Literal["am", "pm"]
CommuteCardStatus = Literal["draft", "active", "expired", "used-up"]
TripCount = Literal[10, 20, 30, 40]


class CommuteReservationBase(BaseModel):
    ride_date: date
    departure_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    direction: Direction
    train_no: str | None = Field(default=None, max_length=20)
    carriage_no: str | None = Field(default=None, max_length=10)
    seat_no: str | None = Field(default=None, max_length=10)

    @field_validator("departure_time")
    @classmethod
    def validate_departure_time(cls, value: str) -> str:
        hour, minute = (int(part) for part in value.split(":"))
        if hour < 0 or hour > 23 or minute < 0 or minute > 59:
            raise ValueError("Invalid departure_time")
        return f"{hour:02d}:{minute:02d}"

    @field_validator("train_no", "carriage_no", "seat_no")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        text = value.strip().upper()
        return text or None


class CommuteReservationCreate(CommuteReservationBase):
    pass


class CommuteReservationUpdate(CommuteReservationBase):
    pass


class CommuteReservationOut(CommuteReservationBase):
    id: int
    card_id: int | None
    travel_slot: TravelSlot
    created_at: datetime


class TicketCommuteListOut(BaseModel):
    items: list[CommuteReservationOut]


class CommuteCardCreate(BaseModel):
    trip_count: TripCount
    created_at: datetime | None = None


class CommuteCardOut(BaseModel):
    id: int
    trip_count: TripCount
    created_at: datetime
    effective_date: date | None = None
    expiry_date: date | None = None
    used_count: int
    remaining_count: int
    status: CommuteCardStatus
    reservations: list[CommuteReservationOut]


class CommuteCardListOut(BaseModel):
    items: list[CommuteCardOut]