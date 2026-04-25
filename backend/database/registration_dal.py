"""DAL для регистрации водителей."""
import json
import secrets
from datetime import datetime, timedelta
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database.db import get_conn, new_id


def _migrate(c):
    """Добавляет новые колонки в существующую таблицу (идемпотентно)."""
    cols = {r["name"] for r in c.execute("PRAGMA table_info(drivers_registration)").fetchall()}
    additions = [
        ("manual_review_required", "INTEGER DEFAULT 0"),
        ("manual_review_reason", "TEXT"),
        ("verification_level", "INTEGER DEFAULT 0"),
        ("role", "TEXT DEFAULT 'guest'"),
        ("is_demo", "INTEGER DEFAULT 0"),
        ("city", "TEXT"),
        ("about", "TEXT"),
    ]
    for name, ddl in additions:
        if name not in cols:
            c.execute(f"ALTER TABLE drivers_registration ADD COLUMN {name} {ddl}")


# ---------- Lazy registration ----------
def create_guest() -> dict:
    """Создать гостя (verification_level=0).
    Уникальный placeholder для phone, чтобы удовлетворить UNIQUE NOT NULL ограничение в старых схемах."""
    with get_conn() as c:
        did = new_id()
        placeholder_phone = f"guest_{did[:12]}"
        c.execute(
            "INSERT INTO drivers_registration (id, phone, verification_level, role, current_step) "
            "VALUES (?, ?, 0, 'guest', 0)",
            (did, placeholder_phone),
        )
        row = c.execute("SELECT * FROM drivers_registration WHERE id = ?", (did,)).fetchone()
        return dict(row)


def upgrade_level(driver_id: str, level: int, role: str = None):
    """Повысить уровень доверия (0→1→2→3)."""
    fields = {"verification_level": level}
    if role:
        fields["role"] = role
    update_driver(driver_id, fields)


def init_registration_schema():
    """Выполнить schema для таблиц регистрации + миграции."""
    schema = Path(__file__).resolve().parent / "registration_schema.sql"
    with get_conn() as c:
        c.executescript(schema.read_text(encoding="utf-8"))
        _migrate(c)
        c.commit()


# ---------- Verification Codes ----------
def save_code(phone: str, code: str, ttl_minutes: int = 5):
    expires = (datetime.utcnow() + timedelta(minutes=ttl_minutes)).isoformat()
    with get_conn() as c:
        c.execute(
            "INSERT INTO verification_codes (phone, code, expires_at) VALUES (?, ?, ?) "
            "ON CONFLICT(phone) DO UPDATE SET code=?, expires_at=?, attempts=0",
            (phone, code, expires, code, expires),
        )


def check_code(phone: str, code: str) -> bool:
    with get_conn() as c:
        row = c.execute(
            "SELECT code, expires_at, attempts FROM verification_codes WHERE phone = ?",
            (phone,),
        ).fetchone()
        if not row:
            return False
        # Увеличиваем attempts
        c.execute("UPDATE verification_codes SET attempts = attempts + 1 WHERE phone = ?", (phone,))
        if row["attempts"] >= 5:
            return False  # блок после 5 попыток
        if row["expires_at"] < datetime.utcnow().isoformat():
            return False  # истёк
        return row["code"] == code


def delete_code(phone: str):
    with get_conn() as c:
        c.execute("DELETE FROM verification_codes WHERE phone = ?", (phone,))


# ---------- Driver Registration ----------
def get_or_create_driver(phone: str, upgrade_guest_id: str = None) -> dict:
    """Создаёт нового водителя по phone, или апгрейдит существующего guest до level 1."""
    with get_conn() as c:
        # Уже есть по этому phone — возвращаем
        row = c.execute("SELECT * FROM drivers_registration WHERE phone = ?", (phone,)).fetchone()
        if row:
            return dict(row)

        # Есть guest-сессия — апгрейдим её (lazy registration)
        if upgrade_guest_id:
            existing = c.execute(
                "SELECT * FROM drivers_registration WHERE id = ? AND (phone IS NULL OR phone LIKE 'guest_%')",
                (upgrade_guest_id,),
            ).fetchone()
            if existing:
                c.execute(
                    "UPDATE drivers_registration SET phone = ?, whatsapp_verified = 1, "
                    "verification_level = MAX(verification_level, 1), current_step = 2 "
                    "WHERE id = ?",
                    (phone, upgrade_guest_id),
                )
                row = c.execute("SELECT * FROM drivers_registration WHERE id = ?", (upgrade_guest_id,)).fetchone()
                return dict(row)

        # Новый пользователь
        did = new_id()
        c.execute(
            "INSERT INTO drivers_registration (id, phone, whatsapp_verified, verification_level, current_step) "
            "VALUES (?, ?, 1, 1, 2)",
            (did, phone),
        )
        row = c.execute("SELECT * FROM drivers_registration WHERE id = ?", (did,)).fetchone()
        return dict(row)


def get_driver(driver_id: str) -> dict | None:
    with get_conn() as c:
        row = c.execute("SELECT * FROM drivers_registration WHERE id = ?", (driver_id,)).fetchone()
        return dict(row) if row else None


def find_approved_by_iin(iin: str, exclude_id: str = None):
    with get_conn() as c:
        q = "SELECT id, phone, full_name FROM drivers_registration WHERE iin = ? AND status = 'approved'"
        params = [iin]
        if exclude_id:
            q += " AND id != ?"
            params.append(exclude_id)
        row = c.execute(q, params).fetchone()
    return dict(row) if row else None


def find_approved_by_plate(plate: str, exclude_id: str = None):
    with get_conn() as c:
        q = "SELECT id, phone, full_name FROM drivers_registration WHERE vehicle_plate = ? AND status = 'approved'"
        params = [plate]
        if exclude_id:
            q += " AND id != ?"
            params.append(exclude_id)
        row = c.execute(q, params).fetchone()
    return dict(row) if row else None


def update_driver(driver_id: str, updates: dict):
    if not updates:
        return
    # JSON-поля
    for key in ("license_ocr", "passport_ocr"):
        if key in updates and not isinstance(updates[key], str):
            updates[key] = json.dumps(updates[key], ensure_ascii=False)
    keys = ", ".join([f"{k} = ?" for k in updates])
    with get_conn() as c:
        c.execute(
            f"UPDATE drivers_registration SET {keys}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (*updates.values(), driver_id),
        )


# ---------- Sessions ----------
def create_session(driver_id: str, ttl_days: int = 30) -> str:
    token = secrets.token_urlsafe(32)
    expires = (datetime.utcnow() + timedelta(days=ttl_days)).isoformat()
    with get_conn() as c:
        c.execute(
            "INSERT INTO reg_sessions (token, driver_id, expires_at) VALUES (?, ?, ?)",
            (token, driver_id, expires),
        )
    return token


def get_driver_by_token(token: str) -> str | None:
    with get_conn() as c:
        row = c.execute(
            "SELECT driver_id, expires_at FROM reg_sessions WHERE token = ?",
            (token,),
        ).fetchone()
        if not row:
            return None
        if row["expires_at"] < datetime.utcnow().isoformat():
            c.execute("DELETE FROM reg_sessions WHERE token = ?", (token,))
            return None
        return row["driver_id"]
