"""DAL для CGR-интеграции (Поток А).

Содержит:
  - init_cgr_schema() — применение cgr_schema.sql
  - seed_border_checkpoints_from_legacy() — однократный перенос хардкода
    BORDERS из services/border_service.py в таблицу border_checkpoints.
    Идемпотентно (INSERT OR IGNORE).
  - DAL-функции для всех 6 CGR-таблиц.

Вызывается из main.py на startup. Style — повторяет existing
registration_dal.py / reviews_dal.py / consent_dal.py.
"""
import hashlib
import json
import re
import sqlite3
import sys
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Iterable

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config


_SCHEMA_PATH = Path(__file__).resolve().parent / "schemas" / "cgr_schema.sql"


# ----------------------------------------------------------------
# Schema init + seed
# ----------------------------------------------------------------
def init_cgr_schema() -> None:
    """Применить cgr_schema.sql (идемпотентно — все CREATE TABLE IF NOT EXISTS)."""
    Path(config.DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(config.DB_PATH) as conn:
        conn.executescript(_SCHEMA_PATH.read_text(encoding="utf-8"))
        migrate_legacy_identity_values(conn, "cgr_booking_status", "urtruck_user_id")
        conn.commit()


_TOKEN_SHAPED = re.compile(r"^[A-Za-z0-9_-]{40,128}$")
_IDENTITY_COLUMNS = {
    ("cgr_booking_status", "urtruck_user_id"),
    ("queue_watches", "user_id"),
}


def is_token_shaped_identity(value: str) -> bool:
    return bool(isinstance(value, str) and _TOKEN_SHAPED.fullmatch(value))


def migrate_legacy_identity_values(conn: sqlite3.Connection, table: str, column: str) -> dict:
    """Replace legacy bearer-as-identity values without ever logging tokens.

    Exact values still present in ``reg_sessions`` are mapped to their stable
    driver ID (expired sessions are safe to map; they still cannot authorize).
    Token-shaped orphan values, including revoked sessions whose mapping no
    longer exists, are replaced by a non-secret deterministic quarantine ID.
    The migration is idempotent and skips databases where auth tables have not
    been initialized yet.
    """
    if (table, column) not in _IDENTITY_COLUMNS:
        raise ValueError("unsupported identity migration target")
    tables = {
        row[0] for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    }
    if table not in tables or "reg_sessions" not in tables or "drivers_registration" not in tables:
        return {"mapped": 0, "quarantined": 0}
    rows = conn.execute(f"SELECT DISTINCT {column} FROM {table}").fetchall()
    mapped = quarantined = 0
    for row in rows:
        value = row[0]
        if not isinstance(value, str) or not _TOKEN_SHAPED.fullmatch(value):
            continue
        owner = conn.execute(
            "SELECT s.driver_id FROM reg_sessions s "
            "JOIN drivers_registration d ON d.id=s.driver_id WHERE s.token=?",
            (value,),
        ).fetchone()
        if owner:
            replacement = owner[0]
        else:
            replacement = "legacy-orphan-" + hashlib.sha256(value.encode("utf-8")).hexdigest()[:24]
        try:
            conn.execute(
                f"UPDATE {table} SET {column}=? WHERE {column}=?",
                (replacement, value),
            )
        except sqlite3.IntegrityError:
            # Two historical sessions of one driver may have created the same
            # booking/watch. Preserve the row without retaining either bearer;
            # the deterministic quarantine identity cannot authorize access.
            replacement = "legacy-orphan-" + hashlib.sha256(value.encode("utf-8")).hexdigest()[:24]
            conn.execute(
                f"UPDATE {table} SET {column}=? WHERE {column}=?",
                (replacement, value),
            )
            quarantined += 1
            continue
        if owner:
            mapped += 1
        else:
            quarantined += 1
    return {"mapped": mapped, "quarantined": quarantined}


def _parse_legacy_countries(s: str) -> tuple[str, str]:
    """'KZ↔CN' → ('KZ', 'CN'). Также понимает 'KZ-CN' / 'KZ - CN'."""
    for sep in ("↔", "<->", "-", "—"):
        if sep in s:
            a, b = s.split(sep, 1)
            return a.strip(), b.strip()
    return "KZ", s.strip()


def seed_border_checkpoints_from_legacy() -> int:
    """Перенос хардкода BORDERS → таблица border_checkpoints.

    Returns:
        Количество вставленных записей (0 если уже всё засеялось).

    Безопасно вызывать многократно — INSERT OR IGNORE по PRIMARY KEY.
    Хардкод в border_service.py НЕ удаляется в этой итерации, см.
    docs/cgr/DECISIONS.md §6.
    """
    try:
        # Поздний импорт чтобы не плодить циклы и упасть мягко в тестах
        from services.border_service import BORDERS  # type: ignore
    except Exception:
        return 0

    inserted = 0
    with sqlite3.connect(config.DB_PATH) as conn:
        for b in BORDERS:
            country_from, country_to = _parse_legacy_countries(b.get("countries", "KZ"))
            cur = conn.execute(
                """
                INSERT OR IGNORE INTO border_checkpoints
                    (code, name_ru, name_en, country_from, country_to,
                     lat, lon, type, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                """,
                (
                    b["id"],
                    b["name"],
                    b.get("name_en"),
                    country_from,
                    country_to,
                    b.get("lat"),
                    b.get("lon"),
                    b.get("type"),
                ),
            )
            inserted += cur.rowcount
        conn.commit()
    return inserted


# ----------------------------------------------------------------
# Connection helper (повторяет стиль database/db.py)
# ----------------------------------------------------------------
@contextmanager
def _conn():
    c = sqlite3.connect(config.DB_PATH, timeout=10.0)
    c.row_factory = sqlite3.Row
    try:
        yield c
        c.commit()
    finally:
        c.close()


# ----------------------------------------------------------------
# border_checkpoints
# ----------------------------------------------------------------
def get_all_checkpoints(active_only: bool = True) -> list[dict]:
    where = "WHERE is_active = 1" if active_only else ""
    with _conn() as c:
        rows = c.execute(f"SELECT * FROM border_checkpoints {where} ORDER BY country_to, code").fetchall()
        return [dict(r) for r in rows]


def get_checkpoint(code: str) -> dict | None:
    with _conn() as c:
        r = c.execute("SELECT * FROM border_checkpoints WHERE code = ?", (code,)).fetchone()
        return dict(r) if r else None


# Транслитерация кириллицы для генерации стабильного латинского кода-слага.
_TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "i", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "c", "ч": "ch", "ш": "sh", "щ": "sch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya", "і": "i",
    "ғ": "g", "қ": "k", "ң": "n", "ө": "o", "ұ": "u", "ү": "u", "һ": "h", "ә": "a",
}


def slugify_checkpoint(name: str) -> str:
    """«Нур Жолы - Хоргос» → 'nur_zholy_horgos'. Стабильный код из имени CGR."""
    out = []
    for ch in (name or "").lower():
        if ch in _TRANSLIT:
            out.append(_TRANSLIT[ch])
        elif ch.isalnum():
            out.append(ch)
        else:
            out.append("_")
    slug = "".join(out)
    while "__" in slug:
        slug = slug.replace("__", "_")
    return slug.strip("_")[:64] or "cp"


def upsert_checkpoint(
    name_ru: str,
    country_to: str = "XX",
    country_from: str = "KZ",
    code: str | None = None,
) -> str:
    """Гарантирует наличие перехода в border_checkpoints по имени CGR.

    Имя CGR (как в реестре) — естественный ключ; code генерим слагом.
    Идемпотентно. Возвращает code.
    """
    code = code or slugify_checkpoint(name_ru)
    with _conn() as c:
        c.execute(
            """
            INSERT INTO border_checkpoints (code, name_ru, country_from, country_to, is_active)
            VALUES (?, ?, ?, ?, 1)
            ON CONFLICT(code) DO UPDATE SET name_ru = excluded.name_ru, updated_at = CURRENT_TIMESTAMP
            """,
            (code, name_ru, country_from, country_to),
        )
    return code


def get_checkpoint_code_by_name(name_ru: str) -> str | None:
    with _conn() as c:
        r = c.execute(
            "SELECT code FROM border_checkpoints WHERE name_ru = ? LIMIT 1", (name_ru,)
        ).fetchone()
        return r["code"] if r else None


def deactivate_checkpoints_except(active_codes: list[str]) -> int:
    """Деактивирует (is_active=0) все переходы, КРОМЕ переданных кодов.

    Нужно для дедупликации: когда CGR-сид (парные имена «Нур Жолы - Хоргос»)
    становится единственным источником, легаси-строки с короткими именами
    («Нуржолы (Хоргос)») гасятся, чтобы не было дублей в ленте. Идемпотентно;
    list_borders читает только is_active=1. Возвращает число погашенных.
    """
    if not active_codes:
        return 0
    placeholders = ",".join("?" * len(active_codes))
    with _conn() as c:
        cur = c.execute(
            f"UPDATE border_checkpoints SET is_active = 0 "
            f"WHERE is_active = 1 AND code NOT IN ({placeholders})",
            tuple(active_codes),
        )
        return cur.rowcount


# ----------------------------------------------------------------
# cgr_scoreboard
# ----------------------------------------------------------------
def insert_scoreboard_entry(
    checkpoint_code: str,
    direction: str,
    queue_length: int | None,
    estimated_wait_minutes: int | None,
    raw_payload: dict | str | None = None,
) -> int:
    """Insert a fresh scoreboard datapoint. Returns row id."""
    if direction not in ("IN", "OUT"):
        raise ValueError(f"direction must be IN|OUT, got {direction!r}")
    if isinstance(raw_payload, dict):
        raw_payload = json.dumps(raw_payload, ensure_ascii=False)
    with _conn() as c:
        cur = c.execute(
            """
            INSERT INTO cgr_scoreboard
                (checkpoint_code, direction, queue_length, estimated_wait_minutes, raw_payload)
            VALUES (?, ?, ?, ?, ?)
            """,
            (checkpoint_code, direction, queue_length, estimated_wait_minutes, raw_payload),
        )
        return cur.lastrowid


def get_latest_scoreboard() -> list[dict]:
    """Последняя запись по каждой паре (checkpoint_code, direction).

    Returns:
        Список dict с полями checkpoint_code, direction, queue_length,
        estimated_wait_minutes, fetched_at. Для отдачи фронту — сразу
        в форме, удобной для группировки по checkpoint_code.
    """
    sql = """
        SELECT s1.checkpoint_code, s1.direction, s1.queue_length,
               s1.estimated_wait_minutes, s1.fetched_at
        FROM cgr_scoreboard s1
        INNER JOIN (
            SELECT checkpoint_code, direction, MAX(fetched_at) AS max_at
            FROM cgr_scoreboard
            GROUP BY checkpoint_code, direction
        ) s2
            ON s1.checkpoint_code = s2.checkpoint_code
           AND s1.direction = s2.direction
           AND s1.fetched_at = s2.max_at
    """
    with _conn() as c:
        return [dict(r) for r in c.execute(sql).fetchall()]


def consume_public_rate_limit(scope_hash: str, max_requests: int, window_sec: int = 60) -> bool:
    """Atomically consume one public CGR request without storing raw identity."""
    if not scope_hash or max_requests < 1 or window_sec < 1:
        return False
    bucket = int(time.time() // window_sec)
    with _conn() as c:
        c.execute("BEGIN IMMEDIATE")
        c.execute(
            "DELETE FROM cgr_public_rate_limits WHERE window_bucket < ?",
            (bucket - 2,),
        )
        row = c.execute(
            "SELECT attempts FROM cgr_public_rate_limits WHERE scope_hash=? AND window_bucket=?",
            (scope_hash, bucket),
        ).fetchone()
        if row and int(row["attempts"]) >= max_requests:
            return False
        c.execute(
            "INSERT INTO cgr_public_rate_limits(scope_hash,window_bucket,attempts,updated_at) "
            "VALUES(?,?,1,CURRENT_TIMESTAMP) "
            "ON CONFLICT(scope_hash,window_bucket) DO UPDATE SET "
            "attempts=attempts+1, updated_at=CURRENT_TIMESTAMP",
            (scope_hash, bucket),
        )
        return True


# ----------------------------------------------------------------
# cgr_booking_status
# ----------------------------------------------------------------
def create_booking(
    urtruck_user_id: str,
    urtruck_trip_id: str | None,
    cgr_booking_number: str,
    checkpoint_code: str | None = None,
) -> int:
    if not urtruck_user_id or is_token_shaped_identity(urtruck_user_id):
        raise ValueError("stable user identity required")
    with _conn() as c:
        cur = c.execute(
            """
            INSERT INTO cgr_booking_status
                (urtruck_user_id, urtruck_trip_id, cgr_booking_number, checkpoint_code)
            VALUES (?, ?, ?, ?)
            """,
            (urtruck_user_id, urtruck_trip_id, cgr_booking_number, checkpoint_code),
        )
        return cur.lastrowid


def get_booking(booking_id: int) -> dict | None:
    with _conn() as c:
        r = c.execute("SELECT * FROM cgr_booking_status WHERE id = ?", (booking_id,)).fetchone()
        return dict(r) if r else None


def get_booking_for_user(booking_id: int, user_id: str) -> dict | None:
    """Owner-filtered lookup avoids loading another user's CGR row at API level."""
    with _conn() as c:
        r = c.execute(
            "SELECT * FROM cgr_booking_status WHERE id=? AND urtruck_user_id=?",
            (booking_id, user_id),
        ).fetchone()
        return dict(r) if r else None


def get_active_bookings_for_user(user_id: str) -> list[dict]:
    with _conn() as c:
        rows = c.execute(
            "SELECT * FROM cgr_booking_status WHERE urtruck_user_id=? "
            "AND status IN ('pending', 'verified', 'active')",
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def trip_driver_id(trip_id: str) -> str | None:
    """Return stable trip owner identity; absent table/trip fails closed."""
    if not trip_id:
        return None
    try:
        with _conn() as c:
            row = c.execute("SELECT driver_id FROM trips WHERE id=?", (trip_id,)).fetchone()
            return row["driver_id"] if row else None
    except sqlite3.OperationalError:
        return None


def get_active_bookings() -> list[dict]:
    """Брони которые ещё могут менять статус — для cron-опроса."""
    with _conn() as c:
        rows = c.execute(
            "SELECT * FROM cgr_booking_status WHERE status IN ('pending', 'verified', 'active')"
        ).fetchall()
        return [dict(r) for r in rows]


def update_booking_status(
    booking_id: int,
    status: str,
    queue_position: int | None = None,
    last_known_payload: dict | str | None = None,
) -> None:
    if isinstance(last_known_payload, dict):
        last_known_payload = json.dumps(last_known_payload, ensure_ascii=False)
    with _conn() as c:
        c.execute(
            """
            UPDATE cgr_booking_status
            SET status = ?,
                queue_position = COALESCE(?, queue_position),
                last_known_payload = COALESCE(?, last_known_payload),
                last_checked_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (status, queue_position, last_known_payload, booking_id),
        )


def log_booking_poll(
    booking_id: int,
    old_status: str | None,
    new_status: str | None,
    old_position: int | None,
    new_position: int | None,
    push_sent: bool = False,
) -> None:
    changed = int(
        old_status != new_status or (old_position or 0) != (new_position or 0)
    )
    with _conn() as c:
        c.execute(
            """
            INSERT INTO cgr_booking_poll_log
                (booking_id, old_status, new_status, old_position, new_position, changed, push_sent)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (booking_id, old_status, new_status, old_position, new_position, changed, int(push_sent)),
        )


# ----------------------------------------------------------------
# cgr_blocklist + matches
# ----------------------------------------------------------------
def hash_iin(iin: str, salt: str) -> str:
    """SHA256(ИИН + salt) → 64 hex символа. ИИН в БД НИКОГДА не хранится открытым."""
    if not iin or not salt:
        raise ValueError("hash_iin: both iin and salt required")
    return hashlib.sha256((iin + salt).encode("utf-8")).hexdigest()


def normalize_grnz(grnz: str) -> str:
    """ГРНЗ → upper, без пробелов и дефисов. Для exact-матчинга."""
    return "".join(ch for ch in grnz.upper() if ch.isalnum())


def replace_blocklist(entries: Iterable[dict]) -> int:
    """Полная замена чёрного списка (раздел 5.1 чеклиста — full refresh).

    Каждая entry: {iin_hash?, grnz_normalized?, full_name_normalized?,
                   blocked_at?, reason?, raw_payload?}
    Returns: количество вставленных записей.
    """
    inserted = 0
    with _conn() as c:
        c.execute("DELETE FROM cgr_blocklist")
        for e in entries:
            raw = e.get("raw_payload")
            if isinstance(raw, dict):
                raw = json.dumps(raw, ensure_ascii=False)
            c.execute(
                """
                INSERT INTO cgr_blocklist
                    (iin_hash, grnz_normalized, full_name_normalized,
                     blocked_at, reason, raw_payload)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    e.get("iin_hash"),
                    e.get("grnz_normalized"),
                    e.get("full_name_normalized"),
                    e.get("blocked_at"),
                    e.get("reason"),
                    raw,
                ),
            )
            inserted += 1
    return inserted


def get_blocklist_count() -> int:
    with _conn() as c:
        return c.execute("SELECT COUNT(*) FROM cgr_blocklist").fetchone()[0]


def find_blocklist_by_iin_hash(iin_hash: str) -> dict | None:
    with _conn() as c:
        r = c.execute("SELECT * FROM cgr_blocklist WHERE iin_hash = ?", (iin_hash,)).fetchone()
        return dict(r) if r else None


def find_blocklist_by_grnz(grnz: str) -> dict | None:
    norm = normalize_grnz(grnz)
    with _conn() as c:
        r = c.execute("SELECT * FROM cgr_blocklist WHERE grnz_normalized = ?", (norm,)).fetchone()
        return dict(r) if r else None


def record_match(
    urtruck_user_id: str,
    match_type: str,
    match_confidence: str,
    cgr_blocklist_id: int | None,
) -> int:
    """Создать pending-review запись о совпадении. БЕЗ автобана."""
    if match_type not in ("iin", "grnz", "name"):
        raise ValueError(f"match_type must be iin|grnz|name, got {match_type!r}")
    if match_confidence not in ("exact", "fuzzy"):
        raise ValueError(f"match_confidence must be exact|fuzzy, got {match_confidence!r}")
    with _conn() as c:
        cur = c.execute(
            """
            INSERT INTO cgr_blocklist_matches
                (urtruck_user_id, match_type, match_confidence, cgr_blocklist_id)
            VALUES (?, ?, ?, ?)
            """,
            (urtruck_user_id, match_type, match_confidence, cgr_blocklist_id),
        )
        return cur.lastrowid


# ----------------------------------------------------------------
# cgr_push_throttle (раздел 5.3 чеклиста — не более 1 push в час на бронь)
# ----------------------------------------------------------------
def should_send_push(booking_id: int, push_kind: str, throttle_minutes: int = 60) -> bool:
    """True если за последние `throttle_minutes` push такого же kind ещё не уходил."""
    with _conn() as c:
        r = c.execute(
            f"""
            SELECT 1 FROM cgr_push_throttle
            WHERE booking_id = ? AND push_kind = ?
              AND sent_at > datetime('now', '-{int(throttle_minutes)} minutes')
            LIMIT 1
            """,
            (booking_id, push_kind),
        ).fetchone()
        return r is None


def log_push_sent(booking_id: int, push_kind: str) -> None:
    with _conn() as c:
        c.execute(
            "INSERT INTO cgr_push_throttle (booking_id, push_kind) VALUES (?, ?)",
            (booking_id, push_kind),
        )
