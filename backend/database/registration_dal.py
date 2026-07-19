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
        # ТЗ онбординг — поля 6-шагового мастера водителя фуры.
        ("birth_date", "TEXT"),                 # шаг 1 (ДД.ММ.ГГГГ)
        ("personal_photo_url", "TEXT"),         # шаг 1: ключ/URL личного фото в storage
        ("residence_status", "TEXT"),           # шаг 2: citizen|kandas|foreigner
        # Новый порядок верификации: шаг 1 «Гражданство» + шаг 2 «Удостоверение
        # личности (2 стороны)». Всё добавлением — старые колонки не трогаем.
        ("citizenship_country", "TEXT"),         # шаг 1: KZ|RU|UZ|KG|TJ|other
        ("id_doc_type", "TEXT"),                 # шаг 2: id_card|passport|residence_permit
        ("id_front_url", "TEXT"),                # шаг 2: удостоверение — лицевая
        ("id_back_url", "TEXT"),                 # шаг 2: удостоверение — оборотная
        ("license_category", "TEXT"),           # шаг 3: напр. 'B, C, CE'
        ("license_issue_date", "TEXT"),         # шаг 3: для стажа
        ("license_expiry", "TEXT"),             # шаг 3: срок действия
        ("license_number", "TEXT"),             # шаг 3: номер прав (OCR)
        ("license_selfie_url", "TEXT"),         # шаг 3: ключ/URL селфи с правами
        ("vehicle_model", "TEXT"),              # шаг 4 (brand уже есть)
        ("vehicle_color", "TEXT"),              # шаг 4: цвет кузова/кабины (PR #70 UI)
        ("body_type", "TEXT"),                  # шаг 5: tent|ref|izoterm|board|container|tanker|platform
        ("truck_kind", "TEXT"),                 # шаг 5: тип ТС (tractor_semitrailer и т.д.)
        ("capacity_tons", "REAL"),              # шаг 5
        ("volume_m3", "REAL"),                  # шаг 5
        ("dims_l_m", "REAL"), ("dims_w_m", "REAL"), ("dims_h_m", "REAL"),  # шаг 5 (необяз.)
        ("adr", "INTEGER DEFAULT 0"),           # шаг 5: опасный груз
        ("adr_cert_url", "TEXT"),               # шаг 5 (опц.)
        ("vehicle_photo_url", "TEXT"),          # ЭТАП 6: фото авто снаружи (для старых БД)
        ("cabin_photo_url", "TEXT"),            # ЭТАП 6: фото салона/кабины
        ("has_straps", "INTEGER DEFAULT 0"),    # шаг 5 (опц.)
        ("draft_json", "TEXT"),                 # auto-save состояния мастера
        ("submitted_at", "TEXT"),               # POST submit
    ]
    for name, ddl in additions:
        if name not in cols:
            c.execute(f"ALTER TABLE drivers_registration ADD COLUMN {name} {ddl}")


def _migrate_unique_iin(c):
    """DB-level защита от дубликата ИИН среди approved-водителей.

    App-level проверка уже есть (find_approved_by_iin → HTTP 409 на /selfie),
    но при гонке двух параллельных запросов до коммита дубль теоретически
    проскочит. Partial UNIQUE index закрывает гонку на уровне БД.

    Создаём ИДЕМПОТЕНТНО и БЕЗОПАСНО: если в живой БД уже есть approved-дубли
    (исторические данные), CREATE UNIQUE INDEX упал бы и уронил старт сервиса —
    поэтому сперва проверяем дубли. Если они есть, индекс НЕ создаём, а пишем
    предупреждение в лог (модератор разрулит вручную). Если дублей нет —
    ставим индекс, и дальше гонка невозможна.
    """
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
        # Миграция не должна валить старт сервиса ни при каких условиях.
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


def delete_session(token: str) -> bool:
    """QA-аудит P1-7: явный revoke токена при logout. Раньше серверной
    инвалидации не было — токен жил до истечения TTL (30 дней), украденное
    устройство держало сессию. Возвращает True если строка удалена."""
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

    Требование Apple: приложение с регистрацией ОБЯЗАНО давать удаление
    аккаунта прямо в приложении. Мы обезличиваем все персональные данные
    (PII) и отзываем все сессии. Строку физически НЕ удаляем, чтобы не
    осиротить связанные сущности (сделки/чаты/скоринг ссылаются на user_id),
    но после этого войти под аккаунтом невозможно, а личные данные стёрты.

    Идемпотентно: повторный вызов безопасен. Возвращает True, если аккаунт
    найден и обезличен; False — если такого driver_id нет (сессии всё равно
    зачищаются).
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
        # PII-поля — обнуляем те, что реально существуют в схеме.
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
        # phone — UNIQUE NOT NULL в старых схемах, поэтому ставим уникальный
        # placeholder, а не NULL.
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
        # Отзываем все активные сессии этого пользователя.
        c.execute("DELETE FROM reg_sessions WHERE driver_id = ?", (driver_id,))
        return True
