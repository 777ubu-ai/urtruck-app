"""InApp Notifications API — история уведомлений с колокольчиком."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, Depends
from database.db import get_conn
from api.verification_gate import require_level

notif_router = APIRouter()


def _init():
    schema = Path(__file__).resolve().parent.parent / "database" / "notifications_schema.sql"
    if schema.exists():
        with get_conn() as c:
            c.executescript(schema.read_text(encoding="utf-8"))
            c.commit()
    _migrate_event_key()


def _migrate_event_key():
    """Блок 6 аудита (P1-8): notification — источник истины, push — только
    способ доставки. Для scheduler/admin-событий (не одноразовых bid/deal-
    экшенов) нужна дедупликация: если джоба случайно перезапустится в то же
    окно (или два воркера пересекутся), одно и то же событие не должно
    превратиться в 2 записи. `event_key` — аддитивная, идемпотентная
    миграция; старые строки остаются с NULL (не участвуют в уникальности —
    partial index)."""
    with get_conn() as c:
        cols = {r["name"] for r in c.execute("PRAGMA table_info(notifications)").fetchall()}
        if "event_key" not in cols:
            try:
                c.execute("ALTER TABLE notifications ADD COLUMN event_key TEXT")
            except Exception:
                pass
        c.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_event_key "
            "ON notifications(user_id, event_key) WHERE event_key IS NOT NULL"
        )
        c.commit()

_init()


def create_notification(user_id: str, type: str, title: str, body: str = "", icon: str = "🔔", url: str = "/",
                         event_key: str = None):
    """Вызывается из других модулей для создания InApp уведомления.

    event_key (Блок 6, P1-8): опциональный ключ дедупликации в рамках
    пользователя — при повторном вызове с тем же (user_id, event_key)
    вторая запись НЕ создаётся (UNIQUE partial index, ON CONFLICT DO
    NOTHING). Используется для scheduler-джоб (reminder/expired/no_bids) и
    админ-решений (approve/reject документов), где push мог не дойти, а
    повторный прогон джобы/повторный клик — не должен задвоить запись.
    Без event_key поведение прежнее (обычный INSERT, для bid/deal-событий,
    которые и так одноразовые по своей природе)."""
    with get_conn() as c:
        if event_key:
            # Partial unique index (WHERE event_key IS NOT NULL) — SQLite
            # требует повторить тот же WHERE в самом ON CONFLICT-таргете,
            # иначе "ON CONFLICT clause does not match any ... constraint".
            c.execute(
                "INSERT INTO notifications (user_id, type, title, body, icon, url, event_key) "
                "VALUES (?,?,?,?,?,?,?) "
                "ON CONFLICT(user_id, event_key) WHERE event_key IS NOT NULL DO NOTHING",
                (user_id, type, title, body, icon, url, event_key),
            )
        else:
            c.execute(
                "INSERT INTO notifications (user_id, type, title, body, icon, url) VALUES (?,?,?,?,?,?)",
                (user_id, type, title, body, icon, url),
            )


def mark_notifications_read_by_urls(user_id: str, urls) -> int:
    """Блок 5 аудита (P1-2): «событие, отображённое внутри конкретной
    карточки/чата, помечается прочитанным при открытии» — вызывается из
    GET /market/deals/{id}, /cargos/{id}, /trips/{id} (см. api/marketplace.py)
    для ТЕКУЩЕГО пользователя каждый раз, когда он реально открывает
    сущность, к которой ведёт уведомление. Раньше единственное место,
    гасившее notifUnread (POST /notifications/read-all), было доступно
    только с экрана NotificationsScreen, а тот нигде не подключён к
    навигации (колокольчик убран по канону) — notifUnread рос бессрочно.
    Это НЕ «погасить всё при открытии вкладки» (см. ТЗ п.3 — так делать
    нельзя, если пользователь событие не видел) — гасятся только
    уведомления с URL, который пользователь только что реально открыл.
    Best-effort, не бросает исключений наружу."""
    urls = [u for u in (urls or []) if u]
    if not user_id or not urls:
        return 0
    # Некоторые уведомления (например bid_created) кладут url с query-
    # строкой — "/cargos/{id}?bid={bid_id}" (см. marketplace.py create_bid),
    # не голый путь. Сравниваем и точным совпадением, и префиксом ("url
    # LIKE 'path?%'"), чтобы оба варианта гасли при открытии сущности.
    try:
        with get_conn() as c:
            placeholders_eq = " OR ".join(["url = ?"] * len(urls))
            placeholders_like = " OR ".join(["url LIKE ?"] * len(urls))
            params = list(urls) + [f"{u}?%" for u in urls]
            cur = c.execute(
                f"UPDATE notifications SET is_read = 1 "
                f"WHERE user_id = ? AND is_read = 0 AND ({placeholders_eq} OR {placeholders_like})",
                (user_id, *params),
            )
            return cur.rowcount or 0
    except Exception:
        return 0


@notif_router.get("")
def list_notifications(limit: int = 50, user=Depends(require_level(1))):
    with get_conn() as c:
        rows = c.execute(
            "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
            (user["id"], limit),
        ).fetchall()
    return {"notifications": [dict(r) for r in rows]}


@notif_router.get("/unread")
def unread_count(user=Depends(require_level(1))):
    with get_conn() as c:
        row = c.execute(
            "SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0",
            (user["id"],),
        ).fetchone()
    return {"unread": row["cnt"] if row else 0}


@notif_router.post("/read-all")
def mark_all_read(user=Depends(require_level(1))):
    with get_conn() as c:
        c.execute("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0", (user["id"],))
    return {"ok": True}


@notif_router.post("/read/{notif_id}")
def mark_read(notif_id: int, user=Depends(require_level(1))):
    with get_conn() as c:
        c.execute("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?", (notif_id, user["id"]))
    return {"ok": True}
