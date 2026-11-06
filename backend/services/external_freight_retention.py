"""Single source of truth for externally published offer retention."""

from datetime import datetime, timedelta, timezone

CARGO_ACTIVE_DAYS = 30
VEHICLE_ACTIVE_DAYS = 30
CARGO_RETENTION_SECONDS = CARGO_ACTIVE_DAYS * 24 * 60 * 60
VEHICLE_RETENTION_SECONDS = VEHICLE_ACTIVE_DAYS * 24 * 60 * 60
MAX_RETENTION_SECONDS = CARGO_RETENTION_SECONDS


def active_days(kind):
    return CARGO_ACTIVE_DAYS if kind == "cargo" else VEHICLE_ACTIVE_DAYS


def retention_seconds(kind):
    return active_days(kind) * 24 * 60 * 60


def published_deadline(published_at, kind):
    published = datetime.fromisoformat(str(published_at).replace("Z", "+00:00"))
    if published.tzinfo is None:
        published = published.replace(tzinfo=timezone.utc)
    return published.astimezone(timezone.utc) + timedelta(days=active_days(kind))


def within_retention(published_at, kind, now):
    """The exact deadline is expired, consistently in UTC."""
    current = datetime.fromtimestamp(now, timezone.utc) if isinstance(now, (int, float)) else now
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    return published_deadline(published_at, kind) > current.astimezone(timezone.utc)
