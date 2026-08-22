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
        # Canonical login identity. Historically email OTP reused `phone` as a
        # generic identifier. Once ProfileV2 saved the real contact phone, a
        # later email login could no longer find that row and could create a
        # duplicate account. Email/social identity now has its own column;
        # `phone` remains only a logistics/contact number.
        ("email", "TEXT"),
        # ТЗ онбординг — поля 6-шагового мастера водителя фуры.
        ("birth_date", "TEXT"),
        ("personal_photo_url", "TEXT"),
        ("residence_status", "TEXT"),
        ("citizenship_country", "TEXT"),
        ("id_doc_type", "TEXT"),
        ("id_front_url", "TEXT"),
        ("id_back_url", "TEXT"),
        ("license_category", "TEXT"),
        ("license_issue_date", "TEXT"),
        ("license_expiry", "TEXT"),
        ("license_number", "TEXT"),
        ("license_selfie_url", "TEXT"),
        ("tech_back_url", "TEXT"),
        ("license_back_url", "TEXT"),
        ("vehicle_model", "TEXT"),
        ("vehicle_color", "TEXT"),
        ("body_type", "TEXT"),
        ("truck_kind", "TEXT"),
        ("capacity_tons", "REAL"),
        ("volume_m3", "REAL"),
        ("dims_l_m", "REAL"), ("dims_w_m", "REAL"), ("dims_h_m", "REAL"),
        ("adr", "INTEGER DEFAULT 0"),
        ("adr_cert_url", "TEXT"),
        ("vehicle_photo_url", "TEXT"),
        ("cabin_photo_url", "TEXT"),
        ("has_straps", "INTEGER DEFAULT 0"),
        ("draft_json", "TEXT"),
        ("submitted_at", "TEXT"),
    ]
    for name, ddl in additions:
        if name not in cols:
            c.execute(f"ALTER TABLE drivers_registration ADD COLUMN {name} {ddl}")


def _migrate_email_identity(c):
    """Backfill stable auth-email identity and protect it from duplicates.

    Legacy email registrations stored the email in `phone`. Preserve those
    accounts by copying email-shaped values into the new `email` column before
    ProfileV2/contact-phone updates happen. A case-insensitive partial unique
    index prevents two UrTruck accounts from owning the same login email.

    Historical duplicates should never block production startup: if any are
    already present, log the condition and skip only the unique index so an
    operator can reconcile them safely.
    """
    try:
        c.execute(
            "UPDATE drivers_registration "
            "SET email = lower(trim(phone)) "
            "WHERE (email IS NULL OR trim(email) = '') "
            "AND phone IS NOT NULL AND instr(phone, '@') > 1"
        )
        dups = c.execute(
            "SELECT lower(trim(email)) AS normalized_email, COUNT(*) AS n "
            "FROM drivers_registration "
            "WHERE email IS NOT NULL AND trim(email) != '' "
            "GROUP BY lower(trim(email)) HAVING n > 1"
        ).fetchall()
        if dups:
            print(
                f"[migrate] UNIQUE(email) skipped: found {len(dups)} duplicate login emails; "
                "reconcile accounts before enabling the index.",
                flush=True,
            )
            return
        c.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_reg_email_ci "
            "ON drivers_registration(lower(trim(email))) "
            "WHERE email IS NOT NULL AND trim(email) != ''"
        )
    except Exception as e:
        print(f"[migrate] email identity migration skipped: {e}", flush=True)


def _migrate_unique_iin(c):
    """DB-level защита от дубликата ИИН среди approved-водителей."""
    try:
        dups = c.execute(
            "SELECT iin, COUNT(*) AS n FROM drivers_registration "
            "WHERE iin IS NOT NULL AND iin != '' AND status = 'approved' "
            "GROUP BY iin HAVING n > 1"
        ).fetchall()
        if dups:
            sample = ", ".join(f"{r['iin'][:6]}***({r['n']})" for r in dups[:5])
            print(
                f"[migrate] UNIQUE(iin) пропущен: найдено {len(dups)} дублей "
                f"среди approved — {sample}. Разрулите вручную, затем перезапустите.",
                flush=True,
            )
            return
        c.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_reg_iin_approved "
            "ON drivers_registration(iin) "
            "WHERE iin IS NOT NULL AND iin != '' AND status = 'approved'"
        )
    except Exception as e:
        print(f"[migrate] UNIQUE(iin) skipped: {e}", flush=True)


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
        _migrate_email_identity(c)
        _migrate_unique_iin(c)
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
        c.execute("UPDATE verification_codes SET attempts = attempts + 1 WHERE phone = ?", (phone,))
        if row["attempts"] >= 5:
            return False
        if row["expires_at"] < datetime.utcnow().isoformat():
            return False
        return row["code"] == code


def delete_code(phone: str):
    with get_conn() as c:
        c.execute("DELETE FROM verification_codes WHERE phone = ?", (phone,))


# ---------- Driver Registration ----------
def _normalize_email(value: str) -> str:
    return str(value or "").strip().lower()


def get_or_create_driver_by_email(email: str, upgrade_guest_id: str = None) -> dict:
    """Find/create an account by stable login email, never by contact phone."""
    normalized = _normalize_email(email)
    if not normalized or "@" not in normalized:
        raise ValueError("invalid email identity")

    with get_conn() as c:
        row = c.execute(
            "SELECT * FROM drivers_registration WHERE lower(trim(email)) = ? LIMIT 1",
            (normalized,),
        ).fetchone()
        if row:
            return dict(row)

        # Extra legacy safety if a row was created before the email migration
        # and the migration has not yet run in this worker/process.
        legacy = c.execute(
            "SELECT * FROM drivers_registration "
            "WHERE lower(trim(phone)) = ? AND instr(phone, '@') > 1 LIMIT 1",
            (normalized,),
        ).fetchone()
        if legacy:
            c.execute(
                "UPDATE drivers_registration SET email = ? WHERE id = ?",
                (normalized, legacy["id"]),
            )
            row = c.execute(
                "SELECT * FROM drivers_registration WHERE id = ?",
                (legacy["id"],),
            ).fetchone()
            return dict(row)

        if upgrade_guest_id:
            existing = c.execute(
                "SELECT * FROM drivers_registration WHERE id = ? "
                "AND (email IS NULL OR trim(email) = '') "
                "AND (phone IS NULL OR phone LIKE 'guest_%')",
                (upgrade_guest_id,),
            ).fetchone()
            if existing:
                c.execute(
                    "UPDATE drivers_registration SET email = ?, whatsapp_verified = 0, "
                    "verification_level = MAX(verification_level, 1), current_step = 2 "
                    "WHERE id = ?",
                    (normalized, upgrade_guest_id),
                )
                row = c.execute(
                    "SELECT * FROM drivers_registration WHERE id = ?",
                    (upgrade_guest_id,),
                ).fetchone()
                return dict(row)

        did = new_id()
        # Keep a non-email placeholder in phone for compatibility with older
        # deployed schemas where phone was NOT NULL/UNIQUE. ProfileV2 replaces
        # this with the real logistics contact before registration completes.
        placeholder_phone = f"auth_{did[:12]}"
        c.execute(
            "INSERT INTO drivers_registration "
            "(id, phone, email, whatsapp_verified, verification_level, current_step) "
            "VALUES (?, ?, ?, 0, 1, 2)",
            (did, placeholder_phone, normalized),
        )
        row = c.execute("SELECT * FROM drivers_registration WHERE id = ?", (did,)).fetchone()
        return dict(row)


def get_or_create_driver(phone: str, upgrade_guest_id: str = None) -> dict:
    """Find/create by auth identifier.

    Phone identifiers keep the existing verified-phone flow. Email-shaped
    identifiers are routed to the stable email identity path so saving a real
    contact phone can never break future Email/Google/Apple login.
    """
    identifier = str(phone or "").strip()
    if "@" in identifier:
        return get_or_create_driver_by_email(identifier, upgrade_guest_id=upgrade_guest_id)

    with get_conn() as c:
        row = c.execute("SELECT * FROM drivers_registration WHERE phone = ?", (identifier,)).fetchone()
        if row:
            return dict(row)

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
                    (identifier, upgrade_guest_id),
                )
                row = c.execute("SELECT * FROM drivers_registration WHERE id = ?", (upgrade_guest_id,)).fetchone()
                return dict(row)

        did = new_id()
        c.execute(
            "INSERT INTO drivers_registration (id, phone, whatsapp_verified, verification_level, current_step) "
            "VALUES (?, ?, 1, 1, 2)",
            (did, identifier),
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


def delete_session(token: str) -> bool:
    """QA-аудит P1-7: явный revoke токена при logout."""
    if not token:
        return False
    with get_conn() as c:
        cur = c.execute("DELETE FROM reg_sessions WHERE token = ?", (token,))
        return cur.rowcount > 0


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


# ---------- Account deletion (App Store Guideline 5.1.1(v)) ----------
def delete_account(driver_id: str) -> bool:
    """Удаление аккаунта пользователем из приложения.

    Обезличивает PII и отзывает все сессии, но сохраняет техническую строку,
    чтобы связанные сделки/чаты не получили orphan foreign keys.
    """
    with get_conn() as c:
        exists = c.execute(
            "SELECT id FROM drivers_registration WHERE id = ?", (driver_id,)
        ).fetchone()
        if not exists:
            c.execute("DELETE FROM reg_sessions WHERE driver_id = ?", (driver_id,))
            return False

        cols = {r["name"] for r in c.execute(
            "PRAGMA table_info(drivers_registration)"
        ).fetchall()}
        null_fields = [
            "full_name", "iin", "personal_photo_url", "license_selfie_url",
            "license_number", "license_ocr", "passport_ocr", "license_category",
            "license_issue_date", "license_expiry", "birth_date", "city",
            "about", "vehicle_plate", "emergency_contact", "passport_intl_url",
            "tir_book_url", "cmr_insurance_url", "vehicle_photo_url",
            "cabin_photo_url", "adr_cert_url", "draft_json", "avatar_url",
            "email",
        ]
        sets = []
        params = []
        if "phone" in cols:
            sets.append("phone = ?")
            params.append(f"deleted_{driver_id[:16]}")
        for f in null_fields:
            if f in cols:
                sets.append(f"{f} = NULL")
        if "status" in cols:
            sets.append("status = 'deleted'")
        if "role" in cols:
            sets.append("role = 'deleted'")
        if "verification_level" in cols:
            sets.append("verification_level = 0")
        if "manual_review_required" in cols:
            sets.append("manual_review_required = 0")
        if "updated_at" in cols:
            sets.append("updated_at = CURRENT_TIMESTAMP")
        params.append(driver_id)
        c.execute(
            f"UPDATE drivers_registration SET {', '.join(sets)} WHERE id = ?",
            params,
        )
        c.execute("DELETE FROM reg_sessions WHERE driver_id = ?", (driver_id,))
        return True
