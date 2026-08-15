"""Push API — Web Push (VAPID) + Native (Expo/FCM).

- POST /subscribe        — web push (endpoint + p256dh + auth)
- POST /register-native  — native (Expo push token / FCM token)
- POST /unsubscribe      — снять подписку web
- POST /unregister-native— удалить native-токен
- POST /test             — тест себе
- GET  /public-key       — VAPID public key для клиента
- GET  /info             — диагностика

Все отправки идут через services/push_sender.send(...) — единая точка.

Аудит P0-1 (05.08.2026): раньше и /subscribe, и /register-native при
конфликте владельца ТИХО переписывали user_id токена/endpoint'а на
вызывающего — любой аутентифицированный пользователь B, узнавший
физический push-токен пользователя A, мог зарегистрировать его на себя
и начать получать чужие push (перехват сообщений/ставок/сумм сделок).
Ниже — модель безопасной привязки: device_id + деактивация вместо тихой
перезаписи + аудит-лог. Подробности — _resolve_ownership().
"""
import os
import sys
import re
import threading
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from typing import Optional

from database.db import get_conn
from api.verification_gate import get_user
from services import push_sender

push_router = APIRouter()


VAPID_PUBLIC = os.getenv("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:admin@urtruck.kz")
PUSH_MOCK = not (VAPID_PUBLIC and VAPID_PRIVATE)

_DEVICE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$")


def _init_schema():
    schema = Path(__file__).resolve().parent.parent / "database" / "push_schema.sql"
    with get_conn() as c:
        c.executescript(schema.read_text(encoding="utf-8"))
        c.commit()
    _migrate_ownership_columns()


def _migrate_ownership_columns():
    """Аддитивная, идемпотентная миграция (P0-1). Ничего не удаляет и не
    переименовывает — существующие строки/поля не трогаем, старые клиенты
    без device_id продолжают работать (см. _resolve_ownership).

    Добавляем: device_id, active, invalidated_at, invalidated_reason,
    app_version (+ platform для push_subscriptions, где его раньше не было
    — у push_tokens_native он уже есть). `last_seen_at` из ТЗ аудита — это
    уже существующая колонка `last_seen`, отдельно не дублируем."""
    additions = {
        "push_subscriptions": [
            ("device_id", "TEXT"),
            ("active", "INTEGER NOT NULL DEFAULT 1"),
            ("invalidated_at", "TEXT"),
            ("invalidated_reason", "TEXT"),
            ("platform", "TEXT"),
            ("app_version", "TEXT"),
        ],
        "push_tokens_native": [
            ("device_id", "TEXT"),
            ("active", "INTEGER NOT NULL DEFAULT 1"),
            ("invalidated_at", "TEXT"),
            ("invalidated_reason", "TEXT"),
            ("app_version", "TEXT"),
        ],
    }
    with get_conn() as c:
        for table, cols in additions.items():
            existing = {r["name"] for r in c.execute(f"PRAGMA table_info({table})").fetchall()}
            for name, decl in cols:
                if name not in existing:
                    try:
                        c.execute(f"ALTER TABLE {table} ADD COLUMN {name} {decl}")
                    except Exception:
                        pass
        c.execute("""
            CREATE TABLE IF NOT EXISTS push_token_audit (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                table_name TEXT NOT NULL,
                token_masked TEXT NOT NULL,
                device_id TEXT,
                old_user_id TEXT,
                new_user_id TEXT,
                action TEXT NOT NULL,   -- claimed | reassigned | conflict_rejected | deactivated
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        c.execute("CREATE INDEX IF NOT EXISTS idx_push_audit_token ON push_token_audit(token_masked)")
        push_log_cols = {r["name"] for r in c.execute("PRAGMA table_info(push_log)").fetchall()}
        if "event_key" not in push_log_cols:
            try:
                c.execute("ALTER TABLE push_log ADD COLUMN event_key TEXT")
            except Exception:
                pass
        c.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_push_log_event_key ON push_log(user_id, event_key) WHERE event_key IS NOT NULL")
        c.commit()


def mask_token(tok: Optional[str]) -> str:
    """Для логов/аудита — никогда не пишем токен целиком (ТЗ аудита, Блок 1 п.5)."""
    if not tok:
        return ""
    tok = str(tok)
    if len(tok) <= 8:
        return tok[:2] + "..."
    return f"{tok[:4]}...{tok[-4:]}"


def _audit(c, table: str, token: str, device_id, old_user_id, new_user_id, action: str):
    c.execute(
        "INSERT INTO push_token_audit (table_name, token_masked, device_id, old_user_id, new_user_id, action) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (table, mask_token(token), device_id, old_user_id, new_user_id, action),
    )
    print(
        f"[push-audit] {action} table={table} token={mask_token(token)} "
        f"device={device_id or '-'} {old_user_id or '-'} -> {new_user_id or '-'}",
        flush=True,
    )


def _optional_user_id(authorization: Optional[str]) -> Optional[str]:
    """Тот же паттерн, что был раньше в subscribe/register-native — auth
    необязателен (гостевые подписки разрешены), но если заголовок битый —
    просто анонимно, без 401."""
    if not (authorization and authorization.startswith("Bearer ")):
        return None
    try:
        from database import registration_dal as reg_dal
        return reg_dal.get_driver_by_token(authorization.split(" ", 1)[1])
    except Exception:
        return None


def _clean_device_id(device_id: Optional[str]) -> Optional[str]:
    """device_id — генерируется клиентом (UUID), не секрет, не user_id, не
    сам push-токен. Валидируем формат мягко (не роняем регистрацию, если
    клиент прислал что-то нестандартное — просто не используем его для
    reassign-логики)."""
    if not device_id or not isinstance(device_id, str):
        return None
    device_id = device_id.strip()
    if not _DEVICE_ID_RE.match(device_id):
        return None
    return device_id


def _resolve_ownership(c, table: str, id_col: str, id_val: str,
                        requester_user_id: Optional[str], device_id: Optional[str]):
    """Решает, можно ли писать в существующую строку `table` по `id_col=id_val`.

    Возвращает (decision, row):
      "new"      — строки ещё нет, обычный INSERT.
      "ok"       — можно писать через COALESCE: владелец совпадает либо
                   существующая строка тоже анонимная (user_id IS NULL).
      "reassign" — легитимная смена владельца: либо старая привязка уже
                   деактивирована (свободный токен, например после logout),
                   либо device_id совпадает с уже сохранённым — то есть
                   запрос подтверждённо идёт с того же физического
                   устройства (простая, но реальная защита от угона токена
                   „по знанию значения" без владения устройством).
      "conflict" — существующая запись принадлежит другому пользователю,
                   либо анонимный/невалидно авторизованный запрос пытается
                   обновить уже владеемую запись. В обоих случаях 409 и
                   никаких изменений ключей/active/last_seen.
    """
    row = c.execute(f"SELECT * FROM {table} WHERE {id_col} = ?", (id_val,)).fetchone()
    if row is None:
        return "new", None
    existing_owner = row["user_id"]
    # P1 pre-merge blocker: анонимный запрос раньше попадал в "ok" для ЛЮБОЙ
    # существующей строки. user_id не менялся благодаря COALESCE, но ключи,
    # метаданные и active=1 обновлялись — достаточно для DoS/реактивации
    # чужой push-регистрации. Аноним может обновлять только анонимную строку.
    if requester_user_id is None:
        return ("ok", row) if existing_owner is None else ("conflict", row)
    if existing_owner is None or existing_owner == requester_user_id:
        return "ok", row
    row_keys = row.keys()
    existing_active = row["active"] if ("active" in row_keys and row["active"] is not None) else 1
    existing_device = row["device_id"] if "device_id" in row_keys else None
    if not existing_active:
        return "reassign", row
    if device_id and existing_device and device_id == existing_device:
        return "reassign", row
    return "conflict", row


def _reassign_device_if_needed(c, device_id: Optional[str], new_user_id: Optional[str]):
    """Инвариант из ТЗ аудита (Блок 1): один device_id не должен активно
    принадлежать двум разным пользователям одновременно. Если это устройство
    физически перешло к новому пользователю (device_id совпал — см.
    _resolve_ownership "reassign"), деактивируем ЛЮБЫЕ другие активные
    push-записи (в обеих таблицах) с тем же device_id, но чужим user_id —
    аналог автоматического logout старого владельца на этом устройстве."""
    if not device_id or not new_user_id:
        return
    for table, id_col in (("push_subscriptions", "endpoint"), ("push_tokens_native", "token")):
        rows = c.execute(
            f"SELECT {id_col} AS ident, user_id FROM {table} "
            f"WHERE device_id = ? AND user_id IS NOT NULL AND user_id != ? AND (active = 1 OR active IS NULL)",
            (device_id, new_user_id),
        ).fetchall()
        for r in rows:
            c.execute(
                f"UPDATE {table} SET active = 0, invalidated_at = CURRENT_TIMESTAMP, "
                f"invalidated_reason = 'device_reassigned' WHERE {id_col} = ?",
                (r["ident"],),
            )
            _audit(c, table, r["ident"], device_id, r["user_id"], new_user_id, "reassigned")


_CONFLICT_DETAIL = {
    "error": "TOKEN_OWNERSHIP_CONFLICT",
    "message": "Этот push-токен/подписка уже привязаны к другому пользователю",
}


class SubscribeIn(BaseModel):
    endpoint: str
    keys: dict  # {p256dh, auth}
    user_agent: Optional[str] = None
    device_id: Optional[str] = None   # UUID, генерируется клиентом один раз (P0-1)
    platform: Optional[str] = None
    app_version: Optional[str] = None


class NativeTokenIn(BaseModel):
    token: str                              # Expo push token или FCM token
    provider: Optional[str] = "expo"        # 'expo' | 'fcm' | 'apns'
    platform: Optional[str] = None          # 'ios' | 'android'
    device_name: Optional[str] = None
    device_id: Optional[str] = None         # UUID, генерируется клиентом один раз (P0-1)
    app_version: Optional[str] = None


@push_router.get("/public-key")
def get_public_key():
    return {"public_key": VAPID_PUBLIC, "mock": PUSH_MOCK}


@push_router.get("/info")
def info():
    return push_sender.info()


@push_router.post("/subscribe")
def subscribe(sub: SubscribeIn, authorization: Optional[str] = Header(None)):
    """Сохранить push-подписку. Юзер необязателен (можно guest).

    BUG-001 fix: раньше `authorization: str = None` без `Header(...)` → FastAPI
    трактовал его как QUERY-параметр, а не HTTP-заголовок → user_id всегда NULL
    → адресный web-push не доходил. Теперь читаем заголовок Authorization.

    P0-1 fix: если endpoint уже активно принадлежит ДРУГОМУ пользователю и
    device_id не подтверждает то же физическое устройство — 409, владелец
    не переписывается молча.
    """
    user_id = _optional_user_id(authorization)
    device_id = _clean_device_id(sub.device_id)

    with get_conn() as c:
        decision, row = _resolve_ownership(c, "push_subscriptions", "endpoint", sub.endpoint, user_id, device_id)
        if decision == "conflict":
            _audit(c, "push_subscriptions", sub.endpoint, device_id, row["user_id"], user_id, "conflict_rejected")
            c.commit()
            raise HTTPException(status_code=409, detail=_CONFLICT_DETAIL)
        if decision == "reassign":
            _audit(c, "push_subscriptions", sub.endpoint, device_id, row["user_id"], user_id, "reassigned")
            c.execute(
                "INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, device_id, platform, app_version) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, "
                "  p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent, "
                "  device_id = excluded.device_id, platform = COALESCE(excluded.platform, platform), "
                "  app_version = COALESCE(excluded.app_version, app_version), "
                "  active = 1, invalidated_at = NULL, invalidated_reason = NULL, last_seen = CURRENT_TIMESTAMP",
                (user_id, sub.endpoint, sub.keys.get("p256dh", ""), sub.keys.get("auth", ""),
                 sub.user_agent, device_id, sub.platform, sub.app_version),
            )
        else:
            if decision == "new" and user_id is not None:
                _audit(c, "push_subscriptions", sub.endpoint, device_id, None, user_id, "claimed")
            c.execute(
                "INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, device_id, platform, app_version) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(endpoint) DO UPDATE SET user_id = COALESCE(excluded.user_id, user_id), "
                "  p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent, "
                "  device_id = COALESCE(excluded.device_id, device_id), "
                "  platform = COALESCE(excluded.platform, platform), "
                "  app_version = COALESCE(excluded.app_version, app_version), "
                "  active = 1, last_seen = CURRENT_TIMESTAMP",
                (user_id, sub.endpoint, sub.keys.get("p256dh", ""), sub.keys.get("auth", ""),
                 sub.user_agent, device_id, sub.platform, sub.app_version),
            )
        # Пре-мёрдж ревью (05.08.2026, P1-блокер, найден 2 независимыми
        # ревьюерами): device-wide деактивация раньше вызывалась БЕЗУСЛОВНО,
        # в том числе на ветке "new" — авторизованный атакующий, просто
        # ЗНАЯ (не владея) чужой device_id, мог заявить его в теле СВОЕЙ
        # НОВОЙ регистрации и мгновенно погасить активный push жертвы, не
        # трогая её токен вообще. Ограничиваем побочную зачистку только
        # веткой "reassign" — там _resolve_ownership уже независимо
        # подтвердил, что ИМЕННО ЭТОТ endpoint/token раньше был связан с
        # этим device_id (либо неактивен и свободен), а не просто принял
        # голое заявление в новом запросе. Узкий побочный эффект: если
        # пользователь НЕ разлогинился явно (POST /push/logout-cleanup) и
        # новый пользователь на том же устройстве регистрирует НОВЫЙ токен
        # (обычный случай при первом входе Expo выдаёт новый токен) — старая
        # активная запись сама по себе не деактивируется этим путём; она
        # гасится штатно через logout-cleanup (основной сценарий) или когда
        # реальный владелец сам явно выйдет.
        if decision == "reassign":
            _reassign_device_if_needed(c, device_id, user_id)
        c.commit()
    # P1-2(legacy) fix: возвращаем user_id, чтобы фронт понял, привязалась ли подписка.
    return {"ok": True, "mock": PUSH_MOCK, "user_id": user_id}


@push_router.post("/unsubscribe")
def unsubscribe(sub: dict, authorization: Optional[str] = Header(None)):
    """Деактивировать web push-подписку (P1-3/P1-4: раньше был hard DELETE
    без проверки владельца — теперь soft-deactivate, и только владелец (или
    анонимная запись) может это сделать; чужую активную подписку — 403."""
    endpoint = sub.get("endpoint")
    if not endpoint:
        raise HTTPException(status_code=400, detail="endpoint required")
    user_id = _optional_user_id(authorization)
    with get_conn() as c:
        row = c.execute("SELECT * FROM push_subscriptions WHERE endpoint = ?", (endpoint,)).fetchone()
        if row is None:
            return {"ok": True}  # уже нет — идемпотентно
        owner = row["user_id"]
        # Пре-мёрдж ревью (05.08.2026, P1-блокер, найден независимым
        # ревьюером): было `owner is not None AND user_id is not None AND
        # owner != user_id` — раз ПОЛНОСТЬЮ анонимный запрос (без заголовка
        # Authorization вообще) даёт user_id=None, второе условие всегда
        # ложно, и проверка НИКОГДА не срабатывала для анонимного
        # вызывающего — любой мог молча деактивировать ЧУЖУЮ владеемую
        # запись, просто не приложив токен. Корректная модель (см. докстринг
        # выше): владеемую (owner is not None) запись может деактивировать
        # ТОЛЬКО её реальный владелец — анонимный вызывающий не приравнён к
        # владельцу. Анонимные (owner is None) записи по-прежнему может
        # деактивировать кто угодно, включая анонима — это не менялось.
        if owner is not None and owner != user_id:
            raise HTTPException(status_code=403, detail="Нельзя отписать чужой push")
        c.execute(
            "UPDATE push_subscriptions SET active = 0, invalidated_at = CURRENT_TIMESTAMP, "
            "invalidated_reason = ? WHERE endpoint = ?",
            (sub.get("reason", "user_unsubscribed"), endpoint),
        )
        _audit(c, "push_subscriptions", endpoint, row["device_id"] if "device_id" in row.keys() else None,
               owner, owner, "deactivated")
        c.commit()
    return {"ok": True}


@push_router.post("/register-native")
def register_native(data: NativeTokenIn, authorization: Optional[str] = Header(None)):
    """Регистрация Expo/FCM push токена (native apps).

    P0-1 fix: см. subscribe() — тот же принцип, реализован для
    push_tokens_native.
    """
    # BUG-008: пустой/битый токен раньше принимался (200) → мусорные строки в
    # push_tokens_native, которые никогда не доставят, и коллизия на ''.
    tok = (data.token or "").strip()
    if not tok or len(tok) < 8:
        raise HTTPException(status_code=400, detail="Некорректный push-токен")
    data.token = tok
    user_id = _optional_user_id(authorization)
    device_id = _clean_device_id(data.device_id)

    with get_conn() as c:
        decision, row = _resolve_ownership(c, "push_tokens_native", "token", tok, user_id, device_id)
        if decision == "conflict":
            _audit(c, "push_tokens_native", tok, device_id, row["user_id"], user_id, "conflict_rejected")
            c.commit()
            raise HTTPException(status_code=409, detail=_CONFLICT_DETAIL)
        if decision == "reassign":
            _audit(c, "push_tokens_native", tok, device_id, row["user_id"], user_id, "reassigned")
            c.execute(
                "INSERT INTO push_tokens_native (user_id, token, provider, platform, device_name, device_id, app_version) "
                "VALUES (?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, "
                "  provider = excluded.provider, platform = COALESCE(excluded.platform, platform), "
                "  device_name = COALESCE(excluded.device_name, device_name), device_id = excluded.device_id, "
                "  app_version = COALESCE(excluded.app_version, app_version), "
                "  active = 1, invalidated_at = NULL, invalidated_reason = NULL, last_seen = CURRENT_TIMESTAMP",
                (user_id, data.token, data.provider or "expo", data.platform, data.device_name, device_id, data.app_version),
            )
        else:
            if decision == "new" and user_id is not None:
                _audit(c, "push_tokens_native", tok, device_id, None, user_id, "claimed")
            c.execute(
                "INSERT INTO push_tokens_native (user_id, token, provider, platform, device_name, device_id, app_version) "
                "VALUES (?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(token) DO UPDATE SET "
                "  user_id = COALESCE(excluded.user_id, user_id), "
                "  provider = excluded.provider, platform = COALESCE(excluded.platform, platform), "
                "  device_name = COALESCE(excluded.device_name, device_name), "
                "  device_id = COALESCE(excluded.device_id, device_id), "
                "  app_version = COALESCE(excluded.app_version, app_version), "
                "  active = 1, last_seen = CURRENT_TIMESTAMP",
                (user_id, data.token, data.provider or "expo", data.platform, data.device_name, device_id, data.app_version),
            )
        # См. комментарий в subscribe() выше — device-wide зачистка только
        # после подтверждённого reassign, не на голое заявление device_id
        # в новой регистрации (пре-мёрдж ревью, P1-блокер).
        if decision == "reassign":
            _reassign_device_if_needed(c, device_id, user_id)
        c.commit()
    return {"ok": True, "user_id": user_id}


@push_router.post("/unregister-native")
def unregister_native(body: dict, authorization: Optional[str] = Header(None)):
    """Деактивировать native push-токен (P1-3/P1-4: soft-deactivate +
    owner-check, было — hard DELETE без проверки владельца)."""
    token = body.get("token")
    if not token:
        raise HTTPException(status_code=400, detail="token required")
    user_id = _optional_user_id(authorization)
    with get_conn() as c:
        row = c.execute("SELECT * FROM push_tokens_native WHERE token = ?", (token,)).fetchone()
        if row is None:
            return {"ok": True}
        owner = row["user_id"]
        # Пре-мёрдж ревью (05.08.2026, P1-блокер, найден независимым
        # ревьюером): было `owner is not None AND user_id is not None AND
        # owner != user_id` — раз ПОЛНОСТЬЮ анонимный запрос (без заголовка
        # Authorization вообще) даёт user_id=None, второе условие всегда
        # ложно, и проверка НИКОГДА не срабатывала для анонимного
        # вызывающего — любой мог молча деактивировать ЧУЖУЮ владеемую
        # запись, просто не приложив токен. Корректная модель (см. докстринг
        # выше): владеемую (owner is not None) запись может деактивировать
        # ТОЛЬКО её реальный владелец — анонимный вызывающий не приравнён к
        # владельцу. Анонимные (owner is None) записи по-прежнему может
        # деактивировать кто угодно, включая анонима — это не менялось.
        if owner is not None and owner != user_id:
            raise HTTPException(status_code=403, detail="Нельзя удалить чужой push-токен")
        c.execute(
            "UPDATE push_tokens_native SET active = 0, invalidated_at = CURRENT_TIMESTAMP, "
            "invalidated_reason = ? WHERE token = ?",
            (body.get("reason", "user_unregistered"), token),
        )
        _audit(c, "push_tokens_native", token, row["device_id"] if "device_id" in row.keys() else None,
               owner, owner, "deactivated")
        c.commit()
    return {"ok": True}


def deactivate_user_push(user_id: str, device_id: Optional[str] = None, reason: str = "logout") -> dict:
    """P1-3/P1-4: используется при logout/удалении аккаунта (api/registration.py).
    Деактивирует ВСЕ push_subscriptions/push_tokens_native текущего user_id
    (опционально — только конкретного device_id, если известен). Мягко
    (active=0), не удаляет исторические записи (аудит/дебаг)."""
    if not user_id:
        return {"web": 0, "native": 0}
    with get_conn() as c:
        if device_id:
            web = c.execute(
                "UPDATE push_subscriptions SET active = 0, invalidated_at = CURRENT_TIMESTAMP, "
                "invalidated_reason = ? WHERE user_id = ? AND device_id = ? AND (active = 1 OR active IS NULL)",
                (reason, user_id, device_id),
            ).rowcount
            native = c.execute(
                "UPDATE push_tokens_native SET active = 0, invalidated_at = CURRENT_TIMESTAMP, "
                "invalidated_reason = ? WHERE user_id = ? AND device_id = ? AND (active = 1 OR active IS NULL)",
                (reason, user_id, device_id),
            ).rowcount
        else:
            web = c.execute(
                "UPDATE push_subscriptions SET active = 0, invalidated_at = CURRENT_TIMESTAMP, "
                "invalidated_reason = ? WHERE user_id = ? AND (active = 1 OR active IS NULL)",
                (reason, user_id),
            ).rowcount
            native = c.execute(
                "UPDATE push_tokens_native SET active = 0, invalidated_at = CURRENT_TIMESTAMP, "
                "invalidated_reason = ? WHERE user_id = ? AND (active = 1 OR active IS NULL)",
                (reason, user_id),
            ).rowcount
        if web or native:
            _audit(c, "push_subscriptions+native", f"user:{user_id}", device_id, user_id, None, "deactivated")
        c.commit()
    return {"web": web, "native": native}


@push_router.post("/logout-cleanup")
def logout_cleanup(body: dict, user=Depends(get_user)):
    """P1-3/P1-4: явный endpoint для фронта — вызывается при logout ДО
    удаления локального токена авторизации. Деактивирует push для текущего
    пользователя (+ конкретного device_id, если передан — иначе все
    устройства этого пользователя)."""
    device_id = _clean_device_id(body.get("device_id"))
    result = deactivate_user_push(user["id"], device_id=device_id, reason="logout")
    return {"ok": True, **result}


# Backward-compatible обёртка — использовалась в старом коде.
def send_to_user(user_id: str, title: str, body: str, url: str = "/", kind: str = "info", data: dict = None) -> int:
    """Legacy: отправить push юзеру. Возвращает суммарное число отправленных.

    PR-C2 (P0-2 app icon badge): добавлены опциональные `kind` и `data`
    параметры. Существующие вызовы (`send_to_user(uid, title, body)`)
    не ломаются. Новые callsites (chat.py) передают kind='chat' чтобы
    push_sender автоматически вычислил unread badge и положил его в
    APNs payload — без этого красный кружок на иконке UrTruck не
    появляется на iPhone home screen даже при включённых notifications.

    QA-аудит P1 (blocking push): push_sender.send делает синхронный
    httpx.post к Expo с timeout=10s. Все callsites (accept_bid, chat send,
    admin approve) вызывали его ВНУТРИ обработчика запроса → при тормозах
    Expo каждый accept/сообщение висели до 10 секунд и выедали threadpool.
    Теперь отправка уходит в daemon-поток; возвращаемое значение нигде не
    использовалось (проверено по всем callsites), /push/test зовёт
    push_sender.send напрямую и сохраняет диагностику.
    """
    def _bg():
        try:
            push_sender.send(user_id, title, body, url=url, kind=kind, data=data)
        except Exception as e:
            print(f"[push] background send failed for {user_id}: {e}", flush=True)
    threading.Thread(target=_bg, daemon=True).start()
    return 0


@push_router.post("/test")
def test_push(body: dict, user=Depends(get_user)):
    """Тестовая отправка себе."""
    r = push_sender.send(
        user["id"],
        body.get("title", "UrTruck"),
        body.get("body", "Тестовое уведомление"),
        kind="test",
        url=body.get("url", "/"),
    )
    return {"sent": r["total"], "web": r["web"], "native": r["native"]}


_init_schema()
