"""DAL для подписки на контакты (Google Play Billing).

Стиль повторяет deal_room_dal.py: get_conn() (Row + commit-on-exit), new_id().
Единственная точка правды по лимиту раскрытий контакта — can_reveal_contact().
Пока config.CONTACTS_MONETIZATION_ENABLED=False (дефолт), она всегда
разрешает — текущее production-поведение не меняется без явного включения
владельцем (см. CLAUDE.md, IS_BETA/монетизация).
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from database.db import get_conn, new_id
import config

_SCHEMA_PATH = Path(__file__).resolve().parent / "schemas" / "payments_schema.sql"


class PurchaseTokenOwnershipError(ValueError):
    """Google purchase token уже навсегда привязан к другому UrTruck user."""


def init_payments_schema() -> None:
    """Применить payments_schema.sql (идемпотентно)."""
    with get_conn() as c:
        c.executescript(_SCHEMA_PATH.read_text(encoding="utf-8"))


def _current_period_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


# ----------------------------------------------------------------
# Subscriptions
# ----------------------------------------------------------------
def upsert_subscription(
    user_id: str,
    *,
    provider: str,
    product_id: str,
    purchase_token: str,
    status: str,
    auto_renewing: bool,
    period_start: str | None,
    period_end: str | None,
    raw_response: str | None = None,
) -> dict:
    """Создать/обновить подписку по (provider, purchase_token) — идемпотентно.
    Google шлёт один и тот же purchase_token и на верификацию покупки, и на
    каждое последующее RTDN-событие продления/отмены — второй вызов должен
    обновить ту же строку, а не плодить дубли."""
    with get_conn() as c:
        row = c.execute(
            "SELECT id, user_id FROM subscriptions WHERE provider = ? AND purchase_token = ?",
            (provider, purchase_token),
        ).fetchone()
        if row:
            if row["user_id"] != user_id:
                raise PurchaseTokenOwnershipError(purchase_token)
            sid = row["id"]
            c.execute(
                """
                UPDATE subscriptions
                SET user_id = ?, product_id = ?, status = ?, auto_renewing = ?,
                    period_start = ?, period_end = ?, raw_response = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (user_id, product_id, status, int(auto_renewing),
                 period_start, period_end, raw_response, sid),
            )
        else:
            sid = new_id()
            c.execute(
                """
                INSERT INTO subscriptions
                    (id, user_id, provider, product_id, purchase_token, status,
                     auto_renewing, period_start, period_end, raw_response)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (sid, user_id, provider, product_id, purchase_token, status,
                 int(auto_renewing), period_start, period_end, raw_response),
            )
        out = c.execute("SELECT * FROM subscriptions WHERE id = ?", (sid,)).fetchone()
        return dict(out)


def get_active_subscription(user_id: str) -> dict | None:
    """Активная подписка пользователя. period_end IS NULL допускается — на
    случай, если Google ещё не прислал дату окончания периода."""
    now = datetime.now(timezone.utc).isoformat()
    with get_conn() as c:
        row = c.execute(
            """
            SELECT * FROM subscriptions
            WHERE user_id = ? AND status = 'active'
              AND (period_end IS NULL OR period_end > ?)
            ORDER BY updated_at DESC LIMIT 1
            """,
            (user_id, now),
        ).fetchone()
        return dict(row) if row else None


def get_subscription_by_token(provider: str, purchase_token: str) -> dict | None:
    with get_conn() as c:
        row = c.execute(
            "SELECT * FROM subscriptions WHERE provider = ? AND purchase_token = ?",
            (provider, purchase_token),
        ).fetchone()
        return dict(row) if row else None


# ----------------------------------------------------------------
# Contact reveal limit
# ----------------------------------------------------------------
def count_reveals_this_period(user_id: str) -> int:
    with get_conn() as c:
        row = c.execute(
            "SELECT COUNT(*) AS n FROM contact_reveals WHERE user_id = ? AND period_key = ?",
            (user_id, _current_period_key()),
        ).fetchone()
        return row["n"] if row else 0


def has_revealed(user_id: str, deal_id: str) -> bool:
    with get_conn() as c:
        row = c.execute(
            "SELECT 1 FROM contact_reveals WHERE user_id = ? AND deal_id = ?",
            (user_id, deal_id),
        ).fetchone()
        return bool(row)


def record_reveal(user_id: str, deal_id: str) -> None:
    """Идемпотентно (UNIQUE(user_id, deal_id)) — повторный просмотр уже
    раскрытого контакта лимит не тратит."""
    with get_conn() as c:
        c.execute(
            "INSERT OR IGNORE INTO contact_reveals (id, user_id, deal_id, period_key) VALUES (?, ?, ?, ?)",
            (new_id(), user_id, deal_id, _current_period_key()),
        )


def can_reveal_contact(user_id: str, deal_id: str) -> dict:
    """Единая точка правды: можно ли показать контакт по этой сделке.

    Возвращает {"allowed", "used", "limit", "unlimited"}. limit=None значит
    "число не имеет смысла показывать" (безлимит либо монетизация выключена).
    Если config.CONTACTS_MONETIZATION_ENABLED=False — всегда allowed=True
    (текущее production-поведение, ничего не меняется, пока владелец явно не
    включит флаг в серверном .env)."""
    if not config.CONTACTS_MONETIZATION_ENABLED:
        return {"allowed": True, "used": 0, "limit": None, "unlimited": True}
    if has_revealed(user_id, deal_id):
        return {"allowed": True, "used": count_reveals_this_period(user_id), "limit": None, "unlimited": False}
    sub = get_active_subscription(user_id)
    if sub and config.PREMIUM_CONTACT_LIMIT <= 0:
        return {"allowed": True, "used": count_reveals_this_period(user_id), "limit": None, "unlimited": True}
    limit = config.PREMIUM_CONTACT_LIMIT if sub else config.FREE_CONTACT_LIMIT
    used = count_reveals_this_period(user_id)
    return {"allowed": used < limit, "used": used, "limit": limit, "unlimited": False}


# ----------------------------------------------------------------
# Deal accept limit (принятие сделки — accept_bid / accept_counter)
# ----------------------------------------------------------------
def count_deal_accepts_this_period(user_id: str, period_key: str | None = None) -> int:
    with get_conn() as c:
        row = c.execute(
            "SELECT COUNT(*) AS n FROM deal_accept_usage WHERE user_id = ? AND period_key = ?",
            (user_id, period_key or _current_period_key()),
        ).fetchone()
        return row["n"] if row else 0


def get_deal_accept_limit(user_id: str) -> dict:
    """Сколько принятий сделок использовано в текущем месяце и каков лимит.

    limit = config.PRO_DEAL_ACCEPT_LIMIT при активной подписке, иначе
    config.FREE_DEAL_ACCEPT_LIMIT. Возвращает {"used", "limit"}."""
    sub = get_active_subscription(user_id)
    limit = config.PRO_DEAL_ACCEPT_LIMIT if sub else config.FREE_DEAL_ACCEPT_LIMIT
    return {"used": count_deal_accepts_this_period(user_id), "limit": limit}


def can_accept_deal(user_id: str) -> bool:
    """Единая точка правды по лимиту принятия сделок.

    config.BETA_MODE или DEAL_ACCEPT_MONETIZATION_ENABLED=False → всегда
    True (бета-тестеры и прод до явного включения флага не ограничиваются).
    Иначе — True, пока used < limit в текущем месяце. Отмена сделки лимит
    не возвращает (см. record_deal_accept)."""
    if config.BETA_MODE or not config.DEAL_ACCEPT_MONETIZATION_ENABLED:
        return True
    st = get_deal_accept_limit(user_id)
    return st["used"] < st["limit"]


def record_deal_accept(user_id: str, deal_id: str, conn=None) -> None:
    """Идемпотентно (UNIQUE(user_id, deal_id)) списать лимит принятия.

    conn — опционально открытая транзакция accept (та же, что и INSERT в
    deals): иначе второе SQLite-соединение упрётся в write-lock. Отмена/
    завершение сделки запись НЕ удаляет — месячный лимит не возвращается."""
    if conn is not None:
        conn.execute(
            "INSERT OR IGNORE INTO deal_accept_usage (id, user_id, deal_id, period_key) VALUES (?, ?, ?, ?)",
            (new_id(), user_id, deal_id, _current_period_key()),
        )
        return
    with get_conn() as c:
        c.execute(
            "INSERT OR IGNORE INTO deal_accept_usage (id, user_id, deal_id, period_key) VALUES (?, ?, ?, ?)",
            (new_id(), user_id, deal_id, _current_period_key()),
        )
