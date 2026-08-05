"""Блок 1 аудита (P0-1): push-токен/web-push endpoint не должен тихо менять
владельца. Пользователь B, узнавший физический токен пользователя A, не
может просто зарегистрировать его на себя и начать получать чужие push.

Проверяем (все — реальными HTTP-запросами через TestClient, изолированная
временная SQLite):
  1) A регистрирует native-токен, повторная регистрация не плодит строк;
  2) B пытается зарегистрировать ТОТ ЖЕ токен без совпадающего device_id
     → 409 TOKEN_OWNERSHIP_CONFLICT, запись A не меняется;
  3) logout деактивирует push A (через POST /push/logout-cleanup);
  4) после деактивации токен свободен — B может его законно занять;
  5) смена пользователя на ОДНОМ устройстве (совпал device_id) переносит
     активные push-записи на нового владельца и деактивирует старые —
     инвариант «один device_id не принадлежит двум активным пользователям
     одновременно»;
  6) invalid/dead токен (Expo DeviceNotRegistered, WebPush 404) помечается
     неактивным, а не удаляется молча;
  7) несколько устройств одного пользователя работают одновременно;
  8) то же самое (hijack-конфликт) для web push (/push/subscribe).

Run from backend/:
    DB_PATH=/tmp/urtruck_test_push_security.db ./venv/bin/python -m tests.test_push_token_security
Exit != 0 на любой ошибке. Совместим с pytest.
"""
import contextvars
import os
import sys
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_push_security.db")
Path(TEST_DB).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from database import db as ddb
from database import registration_dal as reg_dal

ddb.init_db()
reg_dal.init_registration_schema()

from api.push import push_router
import api.push as push_api
from services import push_sender

app = FastAPI()
app.include_router(push_router, prefix="/api/v1/push")
client = TestClient(app)


def _new_user_token() -> tuple[str, str]:
    """Создаёт настоящего guest-пользователя + сессию, как реальный логин."""
    guest = reg_dal.create_guest()
    uid = guest["id"] if isinstance(guest, dict) else guest
    token = reg_dal.create_session(uid)
    return uid, token


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _native_row(token: str):
    from database.db import get_conn
    with get_conn() as c:
        r = c.execute("SELECT * FROM push_tokens_native WHERE token = ?", (token,)).fetchone()
        return dict(r) if r else None


def _sub_row(endpoint: str):
    from database.db import get_conn
    with get_conn() as c:
        r = c.execute("SELECT * FROM push_subscriptions WHERE endpoint = ?", (endpoint,)).fetchone()
        return dict(r) if r else None


# ───────────────────────── native push ─────────────────────────

def test_register_then_reregister_same_owner_no_duplicate():
    uid_a, tok_a = _new_user_token()
    push_tok = "ExponentPushToken[unit-test-aaaaaaaa]"
    r1 = client.post("/api/v1/push/register-native", json={"token": push_tok, "device_id": "d-a-1111111"}, headers=_auth(tok_a))
    assert r1.status_code == 200, r1.text
    r2 = client.post("/api/v1/push/register-native", json={"token": push_tok, "device_id": "d-a-1111111"}, headers=_auth(tok_a))
    assert r2.status_code == 200, r2.text
    row = _native_row(push_tok)
    assert row["user_id"] == uid_a
    from database.db import get_conn
    with get_conn() as c:
        cnt = c.execute("SELECT COUNT(*) c FROM push_tokens_native WHERE token = ?", (push_tok,)).fetchone()["c"]
    assert cnt == 1, "повторная регистрация не должна плодить строки"


def test_b_cannot_hijack_a_token_without_device_match():
    uid_a, tok_a = _new_user_token()
    uid_b, tok_b = _new_user_token()
    push_tok = "ExponentPushToken[unit-test-hijack01]"
    r1 = client.post("/api/v1/push/register-native", json={"token": push_tok, "device_id": "d-a-2222222"}, headers=_auth(tok_a))
    assert r1.status_code == 200, r1.text

    # B знает токен (например, увидел в дебаг-логе), но это НЕ его устройство.
    r2 = client.post("/api/v1/push/register-native", json={"token": push_tok}, headers=_auth(tok_b))
    assert r2.status_code == 409, f"ожидали 409 TOKEN_OWNERSHIP_CONFLICT, получили {r2.status_code}: {r2.text}"
    assert r2.json()["detail"]["error"] == "TOKEN_OWNERSHIP_CONFLICT"

    row = _native_row(push_tok)
    assert row["user_id"] == uid_a, "владелец не должен был измениться"
    assert row["active"] == 1

    # Даже с ЧУЖИМ device_id — тоже конфликт (не совпадает с сохранённым).
    r3 = client.post("/api/v1/push/register-native", json={"token": push_tok, "device_id": "d-b-9999999"}, headers=_auth(tok_b))
    assert r3.status_code == 409, r3.text
    row = _native_row(push_tok)
    assert row["user_id"] == uid_a


def test_logout_deactivates_native_token():
    uid_a, tok_a = _new_user_token()
    push_tok = "ExponentPushToken[unit-test-logout01]"
    client.post("/api/v1/push/register-native", json={"token": push_tok, "device_id": "d-a-3333333"}, headers=_auth(tok_a))
    row = _native_row(push_tok)
    assert row["active"] == 1

    r = client.post("/api/v1/push/logout-cleanup", json={}, headers=_auth(tok_a))
    assert r.status_code == 200, r.text

    row = _native_row(push_tok)
    assert row["active"] == 0, "после logout токен должен быть неактивен"
    assert row["invalidated_reason"] == "logout"

    # push_sender не должен видеть деактивированный токен как получателя.
    tokens = push_sender._native_tokens(uid_a)
    assert push_tok not in [t["token"] for t in tokens]


def test_after_logout_token_can_be_safely_reclaimed_by_another_user():
    uid_a, tok_a = _new_user_token()
    uid_b, tok_b = _new_user_token()
    push_tok = "ExponentPushToken[unit-test-reclaim01]"
    client.post("/api/v1/push/register-native", json={"token": push_tok, "device_id": "d-a-4444444"}, headers=_auth(tok_a))
    client.post("/api/v1/push/logout-cleanup", json={}, headers=_auth(tok_a))

    r = client.post("/api/v1/push/register-native", json={"token": push_tok, "device_id": "d-a-4444444"}, headers=_auth(tok_b))
    assert r.status_code == 200, f"после logout токен должен быть свободен для нового владельца: {r.text}"
    row = _native_row(push_tok)
    assert row["user_id"] == uid_b
    assert row["active"] == 1
    assert row["invalidated_at"] is None


def test_bare_device_id_claim_on_new_token_does_not_deactivate_others():
    """Пре-мёрдж ревью (05.08.2026, P1-блокер, найден 2 независимыми
    ревьюерами): раньше device-wide зачистка (_reassign_device_if_needed)
    вызывалась БЕЗУСЛОВНО, в т.ч. на регистрации СОВЕРШЕННО НОВОГО токена —
    авторизованный атакующий B, просто ЗНАЯ device_id жертвы A (документирован
    как "не секрет" — мог утечь в лог/Sentry/на общем устройстве), мог одним
    запросом со СВОИМ новым токеном и чужим device_id мгновенно погасить
    активный push A, не касаясь её токена вообще. Теперь device-wide зачистка
    происходит ТОЛЬКО когда _resolve_ownership независимо подтвердил legitimate
    reassign для ЭТОГО конкретного identifier (см. test_same_device_user_switch_*
    ниже) — голого заявления device_id в регистрации НОВОГО токена недостаточно."""
    uid_a, tok_a = _new_user_token()
    uid_b, tok_b = _new_user_token()
    device = "d-shared-6666666"
    tok_a_native = "ExponentPushToken[unit-test-dos-victim]"
    tok_b_native = "ExponentPushToken[unit-test-dos-attacker]"

    client.post("/api/v1/push/register-native", json={"token": tok_a_native, "device_id": device}, headers=_auth(tok_a))
    row_a = _native_row(tok_a_native)
    assert row_a["active"] == 1 and row_a["user_id"] == uid_a

    # B (не владеющий устройством A) регистрирует СВОЙ НОВЫЙ токен, заявляя
    # ТОТ ЖЕ device_id, что и A — это ровно эксплойт из ревью.
    r = client.post("/api/v1/push/register-native", json={"token": tok_b_native, "device_id": device}, headers=_auth(tok_b))
    assert r.status_code == 200, r.text  # регистрация СВОЕГО токена — легитимна сама по себе

    row_a_after = _native_row(tok_a_native)
    row_b_after = _native_row(tok_b_native)
    assert row_b_after["user_id"] == uid_b and row_b_after["active"] == 1
    assert row_a_after["active"] == 1, (
        "P1-регресс: A НЕ должна пострадать от того, что B просто заявил её device_id "
        "в регистрации СВОЕГО НОВОГО токена (без владения устройством A)"
    )
    assert tok_a_native in [t["token"] for t in push_sender._native_tokens(uid_a)]


def test_same_device_user_switch_via_explicit_logout_still_works():
    """Легитимный сценарий P1-4 (смена пользователя на одном устройстве)
    по-прежнему работает через ОСНОВНОЙ, рекомендованный путь — явный
    /push/logout-cleanup (вызывается из AuthContext.signOut() до отзыва
    сессии) — а не через голое заявление device_id в новой регистрации."""
    uid_a, tok_a = _new_user_token()
    uid_b, tok_b = _new_user_token()
    device = "d-shared-7777777"
    tok_a_native = "ExponentPushToken[unit-test-switch-a2]"
    tok_b_native = "ExponentPushToken[unit-test-switch-b2]"

    client.post("/api/v1/push/register-native", json={"token": tok_a_native, "device_id": device}, headers=_auth(tok_a))
    client.post("/api/v1/push/logout-cleanup", json={"device_id": device}, headers=_auth(tok_a))
    assert _native_row(tok_a_native)["active"] == 0

    r = client.post("/api/v1/push/register-native", json={"token": tok_b_native, "device_id": device}, headers=_auth(tok_b))
    assert r.status_code == 200, r.text
    assert _native_row(tok_b_native)["user_id"] == uid_b
    assert _native_row(tok_b_native)["active"] == 1
    assert tok_a_native not in [t["token"] for t in push_sender._native_tokens(uid_a)]


def test_invalid_expo_token_marked_inactive_not_deleted(monkeypatch=None):
    """Мокаем Expo response с DeviceNotRegistered — токен обязан стать
    active=0 (не быть молча удалён)."""
    uid_a, tok_a = _new_user_token()
    dead_tok = "ExponentPushToken[unit-test-dead0001]"
    client.post("/api/v1/push/register-native", json={"token": dead_tok, "device_id": "d-a-6666666"}, headers=_auth(tok_a))

    class _FakeResp:
        status_code = 200
        def json(self):
            return {"data": [{"status": "error", "details": {"error": "DeviceNotRegistered"}}]}

    real_post = push_sender.httpx.post
    push_sender.httpx.post = lambda *a, **k: _FakeResp()
    try:
        sent = push_sender._send_expo([dead_tok], "t", "b", {})
        assert sent == 0
    finally:
        push_sender.httpx.post = real_post

    row = _native_row(dead_tok)
    assert row is not None, "строка не должна быть удалена"
    assert row["active"] == 0
    assert row["invalidated_reason"] == "expo_device_not_registered"


def test_multiple_devices_same_user_both_active():
    uid_a, tok_a = _new_user_token()
    t1, t2 = "ExponentPushToken[unit-test-multi-d1]", "ExponentPushToken[unit-test-multi-d2]"
    client.post("/api/v1/push/register-native", json={"token": t1, "device_id": "d-a-7777771"}, headers=_auth(tok_a))
    client.post("/api/v1/push/register-native", json={"token": t2, "device_id": "d-a-7777772"}, headers=_auth(tok_a))
    tokens = {t["token"] for t in push_sender._native_tokens(uid_a)}
    assert t1 in tokens and t2 in tokens, "оба устройства одного юзера должны быть активны одновременно"


# ───────────────────────── web push (/subscribe) ─────────────────────────

def test_web_push_hijack_blocked():
    uid_a, tok_a = _new_user_token()
    uid_b, tok_b = _new_user_token()
    endpoint = "https://fcm.googleapis.com/fcm/send/unit-test-endpoint-001"
    r1 = client.post("/api/v1/push/subscribe", json={
        "endpoint": endpoint, "keys": {"p256dh": "p", "auth": "a"}, "device_id": "d-a-8888888",
    }, headers=_auth(tok_a))
    assert r1.status_code == 200, r1.text

    r2 = client.post("/api/v1/push/subscribe", json={
        "endpoint": endpoint, "keys": {"p256dh": "p2", "auth": "a2"},
    }, headers=_auth(tok_b))
    assert r2.status_code == 409, f"web push endpoint должен быть защищён так же: {r2.status_code} {r2.text}"

    row = _sub_row(endpoint)
    assert row["user_id"] == uid_a
    assert row["p256dh"] == "p", "чужие ключи подписки не должны были записаться поверх"


def test_unsubscribe_requires_ownership():
    uid_a, tok_a = _new_user_token()
    uid_b, tok_b = _new_user_token()
    endpoint = "https://fcm.googleapis.com/fcm/send/unit-test-endpoint-002"
    client.post("/api/v1/push/subscribe", json={
        "endpoint": endpoint, "keys": {"p256dh": "p", "auth": "a"}, "device_id": "d-a-9999998",
    }, headers=_auth(tok_a))

    r = client.post("/api/v1/push/unsubscribe", json={"endpoint": endpoint}, headers=_auth(tok_b))
    assert r.status_code == 403, f"B не должен уметь отписать чужой endpoint: {r.status_code} {r.text}"
    row = _sub_row(endpoint)
    assert row["active"] == 1

    r2 = client.post("/api/v1/push/unsubscribe", json={"endpoint": endpoint}, headers=_auth(tok_a))
    assert r2.status_code == 200, r2.text
    row = _sub_row(endpoint)
    assert row["active"] == 0


def test_anonymous_request_cannot_deactivate_owned_push():
    """Пре-мёрдж ревью (05.08.2026, P1-блокер): было
    `owner is not None AND user_id is not None AND owner != user_id` —
    для ПОЛНОСТЬЮ анонимного запроса (без заголовка Authorization) user_id
    всегда None, второе условие всегда ложно, проверка не срабатывала
    вообще — кто угодно мог молча деактивировать чужую владеемую подписку
    без единого токена авторизации. Владеемую запись должен уметь
    деактивировать только её реальный владелец; анонимная запись
    (owner is None) по-прежнему доступна анониму — не регресс для гостей."""
    uid_a, tok_a = _new_user_token()
    endpoint = "https://fcm.googleapis.com/fcm/send/unit-test-anon-attack"
    native_tok = "ExponentPushToken[unit-test-anon-attack]"
    client.post("/api/v1/push/subscribe", json={
        "endpoint": endpoint, "keys": {"p256dh": "p", "auth": "a"}, "device_id": "d-anon-1",
    }, headers=_auth(tok_a))
    client.post("/api/v1/push/register-native", json={"token": native_tok, "device_id": "d-anon-1"}, headers=_auth(tok_a))

    # Полностью анонимный запрос — БЕЗ заголовка Authorization вообще.
    r1 = client.post("/api/v1/push/unsubscribe", json={"endpoint": endpoint})
    assert r1.status_code == 403, f"аноним не должен уметь деактивировать чужую подписку: {r1.status_code} {r1.text}"
    assert _sub_row(endpoint)["active"] == 1

    r2 = client.post("/api/v1/push/unregister-native", json={"token": native_tok})
    assert r2.status_code == 403, f"аноним не должен уметь деактивировать чужой native-токен: {r2.status_code} {r2.text}"
    assert _native_row(native_tok)["active"] == 1

    # Анонимная (никем не занятая) подписка по-прежнему доступна анониму — не регресс.
    anon_endpoint = "https://fcm.googleapis.com/fcm/send/unit-test-truly-anon"
    client.post("/api/v1/push/subscribe", json={"endpoint": anon_endpoint, "keys": {"p256dh": "p", "auth": "a"}})
    r3 = client.post("/api/v1/push/unsubscribe", json={"endpoint": anon_endpoint})
    assert r3.status_code == 200, f"анонимную (без владельца) подписку аноним отписать обязан: {r3.status_code} {r3.text}"


if __name__ == "__main__":
    fails = 0
    for fn in [test_register_then_reregister_same_owner_no_duplicate,
               test_b_cannot_hijack_a_token_without_device_match,
               test_logout_deactivates_native_token,
               test_after_logout_token_can_be_safely_reclaimed_by_another_user,
               test_bare_device_id_claim_on_new_token_does_not_deactivate_others,
               test_same_device_user_switch_via_explicit_logout_still_works,
               test_invalid_expo_token_marked_inactive_not_deleted,
               test_multiple_devices_same_user_both_active,
               test_web_push_hijack_blocked,
               test_unsubscribe_requires_ownership,
               test_anonymous_request_cannot_deactivate_owned_push]:
        try:
            fn(); print(f"  ✅ {fn.__name__}")
        except Exception as e:
            fails += 1; print(f"  ❌ {fn.__name__}: {e}")
    print(f"\n{'ВСЕ ЗЕЛЁНЫЕ' if not fails else str(fails)+' FAIL'}")
    sys.exit(1 if fails else 0)
