"""Publish durable counts from the scheduler, separate from feed reads."""
import json
import logging
import math
import os
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

from database import external_freight_dal as dal
from database.external_freight_connection import database_path
from services.carrier_directory import list_contacts

logger = logging.getLogger(__name__)
REFRESH_SECONDS = 60
STALE_SECONDS = 3 * REFRESH_SECONDS


def enabled():
    return os.getenv("EXTERNAL_FREIGHT_COUNT_SNAPSHOTS_ENABLED", "").strip().lower() == "true"


def _path(key):
    database = database_path()
    return database.with_name(f"{database.name}.count-v1-{key}.json")


def _read(key):
    try:
        record = json.loads(_path(key).read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except (OSError, ValueError):
        logger.warning("external_freight_count_snapshot_read_failed key=%s", key, exc_info=True)
        return None
    if not isinstance(record, dict):
        return None
    value, as_of = record.get("count"), record.get("as_of")
    if type(value) is not int or value < 0:
        return None
    if type(as_of) not in (int, float) or not math.isfinite(as_of) or not 0 < as_of <= time.time():
        return None
    return value, as_of


def _publish(key, count, as_of):
    if type(count) is not int or count < 0:
        raise ValueError("invalid_external_freight_count")
    path = _path(key)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=f".{path.name}.", mode="w",
                                         encoding="utf-8", delete=False) as output:
            temporary = output.name
            json.dump({"count": count, "as_of": as_of}, output)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            Path(temporary).unlink(missing_ok=True)


def refresh():
    for key, compute in (
        ("cargo", lambda: dal.count_active_items("cargo")),
        ("vehicle", lambda: dal.count_active_items("vehicle")),
        ("carriers", lambda: list_contacts(limit=1)["total"]),
    ):
        started = time.time()
        try:
            _publish(key, compute(), started)
        except Exception:
            logger.exception("external_freight_count_snapshot_refresh_failed key=%s", key)
        else:
            logger.info("external_freight_count_snapshot_published key=%s elapsed_ms=%.0f",
                        key, (time.time() - started) * 1000)


def get(kind, include_carriers):
    offers = _read(kind)
    if offers is None:
        return None
    offer_count, as_of = offers
    carrier_count = 0
    if include_carriers and kind == "vehicle":
        carriers = _read("carriers")
        if carriers is None:
            return None
        carrier_count, carriers_as_of = carriers
        as_of = min(as_of, carriers_as_of)
    return {
        "kind": kind,
        "count": offer_count + carrier_count,
        "offer_count": offer_count,
        "carrier_count": carrier_count,
        "as_of": datetime.fromtimestamp(as_of, timezone.utc).isoformat(),
        "stale": time.time() - as_of > STALE_SECONDS,
    }
