"""SQLite DAL для UrTruck Security."""
import sqlite3
import json
import uuid
import time
from contextlib import contextmanager
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config


def init_db():
    Path(config.DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    schema = Path(__file__).resolve().parent / "security_schema.sql"
    with sqlite3.connect(config.DB_PATH) as conn:
        conn.executescript(schema.read_text(encoding="utf-8"))
        conn.commit()


_WAL_INITIALIZED = False
_MARKET_EXPIRY_LAST_RUN = 0.0
_MARKET_EXPIRY_INTERVAL_SECONDS = 60.0


def _apply_pragmas(conn: sqlite3.Connection) -> None:
    """Set safe concurrency pragmas on every connection.

    journal_mode=WAL is database-wide and persists, so we only run it once per
    process; busy_timeout is per-connection and must be set every time. This
    fixes the `database is locked` errors that fired from push_log inserts
    when a write hit the DB during a long-running read.
    """
    global _WAL_INITIALIZED
    try:
        if not _WAL_INITIALIZED:
            conn.execute("PRAGMA journal_mode=WAL")
            _WAL_INITIALIZED = True
        conn.execute("PRAGMA busy_timeout=5000")
        conn.execute("PRAGMA synchronous=NORMAL")
    except Exception:
        # Pragmas are advisory — never let DB stability tweaks break a request.
        pass


def _market_expiry_due(conn: sqlite3.Connection) -> bool:
    """Cheap request-time guard for deadlines that can be evaluated in SQL.

    The full Python cleanup is throttled for performance, but a bid that turns
    48h old or an ISO-dated listing that rolls into the past must not be
    actionable during that throttle window. These LIMIT-1 probes close that
    race; the periodic full scan remains the fallback for legacy DD.MM.YYYY
    dates and any data anomaly the SQL fast-path does not express.
    """
    active_deals = "'accepted','in_progress','at_border','awaiting_confirmation','delivered','received'"

    bid_due = conn.execute(
        """
        SELECT 1
        FROM bids b
        LEFT JOIN cargos c ON c.id=b.cargo_id
        LEFT JOIN trips t ON t.id=b.trip_id
        WHERE b.status IN ('pending','countered')
          AND (
            datetime(COALESCE(NULLIF(b.updated_at,''), b.created_at), '+48 hours') <= CURRENT_TIMESTAMP
            OR (b.cargo_id IS NOT NULL AND (
                 c.id IS NULL OR c.status <> 'active'
                 OR (c.pickup_date GLOB '????-??-??*' AND substr(c.pickup_date,1,10) < date('now'))
            ))
            OR (b.trip_id IS NOT NULL AND (
                 t.id IS NULL OR t.status <> 'active'
                 OR (t.departure GLOB '????-??-??*' AND substr(t.departure,1,10) < date('now'))
            ))
          )
        LIMIT 1
        """
    ).fetchone()
    if bid_due:
        return True

    cargo_due = conn.execute(
        f"""
        SELECT 1 FROM cargos c
        WHERE c.status='active'
          AND c.pickup_date GLOB '????-??-??*'
          AND substr(c.pickup_date,1,10) < date('now')
          AND NOT EXISTS (
            SELECT 1 FROM deals d
            WHERE d.cargo_id=c.id AND d.status IN ({active_deals})
          )
        LIMIT 1
        """
    ).fetchone()
    if cargo_due:
        return True

    trip_due = conn.execute(
        f"""
        SELECT 1 FROM trips t
        WHERE t.status='active'
          AND t.departure GLOB '????-??-??*'
          AND substr(t.departure,1,10) < date('now')
          AND NOT EXISTS (
            SELECT 1 FROM deals d
            WHERE d.trip_id=t.id AND d.status IN ({active_deals})
          )
        LIMIT 1
        """
    ).fetchone()
    return bool(trip_due)


def _maybe_expire_marketplace(conn: sqlite3.Connection) -> None:
    """Expire stale marketplace state before a request can read/accept it.

    Full cleanup runs at least once per process-minute. Between full scans a
    cheap due probe bypasses the throttle the moment a 48h/ISO-date deadline
    has passed, so a stale offer cannot be accepted in the timing gap.
    """
    global _MARKET_EXPIRY_LAST_RUN
    now_monotonic = time.monotonic()
    try:
        required = ("bids", "cargos", "trips", "deals")
        for table in required:
            exists = conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
                (table,),
            ).fetchone()
            if not exists:
                return

        interval_elapsed = (
            now_monotonic - _MARKET_EXPIRY_LAST_RUN >= _MARKET_EXPIRY_INTERVAL_SECONDS
        )
        if not interval_elapsed and not _market_expiry_due(conn):
            return

        # Lazy import avoids a module cycle: bid_expiry imports get_conn only
        # for its standalone entry point; this path reuses the current conn.
        from datetime import datetime
        from services.bid_expiry import _expire_with_conn

        _expire_with_conn(conn, datetime.utcnow())
        # Make housekeeping durable independently of the caller's later work;
        # otherwise an unrelated API exception could roll expiry back while
        # advancing the throttle clock.
        conn.commit()
        _MARKET_EXPIRY_LAST_RUN = now_monotonic
    except Exception as exc:
        # Housekeeping may retry on the next connection; it must never take a
        # login/security/API request down.
        print(f"[market-expiry] opportunistic cleanup failed: {exc}", flush=True)


@contextmanager
def get_conn():
    # timeout=10s gives SQLite room to wait on a writer instead of immediately
    # raising OperationalError; combined with WAL+busy_timeout this kills the
    # "database is locked" path for normal API traffic.
    conn = sqlite3.connect(config.DB_PATH, timeout=10.0)
    conn.row_factory = sqlite3.Row
    _apply_pragmas(conn)
    _maybe_expire_marketplace(conn)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def new_id() -> str:
    return str(uuid.uuid4())


# ---------- Scores ----------
def upsert_score(user_id: str, score_data: dict) -> dict:
    with get_conn() as c:
        existing = c.execute("SELECT id FROM driver_scores WHERE user_id = ?", (user_id,)).fetchone()
        if existing:
            fields = ", ".join([f"{k} = ?" for k in score_data])
            c.execute(
                f"UPDATE driver_scores SET {fields}, updated_at = CURRENT_TIMESTAMP, check_count = check_count + 1 WHERE user_id = ?",
                (*score_data.values(), user_id)
            )
            row = c.execute("SELECT * FROM driver_scores WHERE user_id = ?", (user_id,)).fetchone()
        else:
            sid = new_id()
            cols = "id, user_id, " + ", ".join(score_data.keys())
            placeholders = ", ".join(["?"] * (len(score_data) + 2))
            c.execute(
                f"INSERT INTO driver_scores ({cols}) VALUES ({placeholders})",
                (sid, user_id, *score_data.values())
            )
            row = c.execute("SELECT * FROM driver_scores WHERE id = ?", (sid,)).fetchone()
        return dict(row) if row else {}


def get_score(user_id: str) -> dict | None:
    with get_conn() as c:
        row = c.execute("SELECT * FROM driver_scores WHERE user_id = ?", (user_id,)).fetchone()
        return dict(row) if row else None


# ---------- Blacklist ----------
def blacklist_add(phone: str = None, plate: str = None, name: str = None,
                   reason: str = "", source: str = "manual",
                   severity: str = "medium") -> dict:
    with get_conn() as c:
        bid = new_id()
        c.execute(
            "INSERT INTO blacklist (id, phone, plate_number, full_name, reason, source, severity) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (bid, phone, plate, name, reason, source, severity)
        )
        row = c.execute("SELECT * FROM blacklist WHERE id = ?", (bid,)).fetchone()
        return dict(row)


def blacklist_check(phone: str = None, plate: str = None, name: str = None) -> list:
    with get_conn() as c:
        q = "SELECT * FROM blacklist WHERE is_active = 1 AND ("
        conds, params = [], []
        if phone:
            conds.append("phone = ?"); params.append(phone)
        if plate:
            conds.append("plate_number = ?"); params.append(plate)
        if name:
            conds.append("full_name = ?"); params.append(name)
        if not conds:
            return []
        q += " OR ".join(conds) + ")"
        rows = c.execute(q, params).fetchall()
        return [dict(r) for r in rows]


# ---------- Verification log ----------
def log_verification(user_id: str, check_type: str, check_source: str,
                      result: str, details: dict = None, score_impact: int = 0):
    with get_conn() as c:
        c.execute(
            "INSERT INTO verification_logs (id, user_id, check_type, check_source, result, details, score_impact) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (new_id(), user_id, check_type, check_source, result,
             json.dumps(details) if details else None, score_impact)
        )


def get_logs(user_id: str, limit: int = 50) -> list:
    with get_conn() as c:
        rows = c.execute(
            "SELECT * FROM verification_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
            (user_id, limit)
        ).fetchall()
        return [dict(r) for r in rows]


# ---------- Telegram mentions ----------
def add_telegram_mention(chat_name: str, message_text: str,
                          phone: str = None, plate: str = None, name: str = None,
                          keywords: list = None, sentiment: str = "neutral"):
    with get_conn() as c:
        c.execute(
            "INSERT INTO telegram_mentions (id, chat_name, message_text, mentioned_phone, mentioned_plate, mentioned_name, keywords_found, sentiment) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (new_id(), chat_name, message_text, phone, plate, name,
             json.dumps(keywords) if keywords else None, sentiment)
        )


def get_mentions(phone: str = None, plate: str = None) -> list:
    with get_conn() as c:
        q = "SELECT * FROM telegram_mentions WHERE 1=1"
        params = []
        if phone:
            q += " AND mentioned_phone = ?"; params.append(phone)
        if plate:
            q += " AND mentioned_plate = ?"; params.append(plate)
        q += " ORDER BY created_at DESC LIMIT 100"
        rows = c.execute(q, params).fetchall()
        return [dict(r) for r in rows]


# ---------- OCR results ----------
def save_ocr(user_id: str, doc_type: str, data: dict, confidence: float, image_url: str = None):
    with get_conn() as c:
        oid = new_id()
        c.execute(
            "INSERT INTO ocr_results (id, user_id, document_type, image_url, extracted_data, confidence) VALUES (?, ?, ?, ?, ?, ?)",
            (oid, user_id, doc_type, image_url, json.dumps(data), confidence)
        )
        return oid


# ---------- Alerts ----------
def add_alert(alert_type: str, severity: str, driver_id: str, message: str, cargo_id: str = None):
    with get_conn() as c:
        aid = new_id()
        c.execute(
            "INSERT INTO security_alerts (id, alert_type, severity, driver_id, cargo_id, message) VALUES (?, ?, ?, ?, ?, ?)",
            (aid, alert_type, severity, driver_id, cargo_id, message)
        )
        return aid


def get_active_alerts() -> list:
    with get_conn() as c:
        rows = c.execute(
            "SELECT * FROM security_alerts WHERE is_resolved = 0 ORDER BY created_at DESC LIMIT 50"
        ).fetchall()
        return [dict(r) for r in rows]
