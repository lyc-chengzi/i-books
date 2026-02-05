from __future__ import annotations

from datetime import datetime, timezone


def to_utc_naive(dt: datetime) -> datetime:
    """Normalize datetimes for DB storage.

    We store UTC in SQL Server using a timezone-naive DateTime column.
    Frontend often sends ISO timestamps with 'Z' (tz-aware). SQL Server/pyodbc
    can error when binding tz-aware datetimes into DateTime(timezone=False).
    """

    if dt.tzinfo is None:
        return dt

    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def as_utc(dt: datetime) -> datetime:
    """Treat a DB-stored UTC-naive datetime as UTC-aware for API responses."""

    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc)

    return dt.replace(tzinfo=timezone.utc)
