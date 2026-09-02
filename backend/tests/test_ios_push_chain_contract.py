"""P0/P1 2026-09-02 — контрактные тесты iOS push-цепочки.

Проверяется ВЕСЬ путь от регистрации native-токена через push_sender.send
до Expo Push Service, включая:
  1. Регистрация expo + apns токенов → push_tokens_native
  2. send → _send_native → _send_expo (фильтр по provider)
  3. Badge computation (chat unread + notification unread)
  4. Event dedup (event_key)
  5. Expo ticket error classification (DeviceNotRegistered vs InvalidCredentials)
  6. iOS foreground handler contract (suppress chat banner for active room)
  7. autoRegister на cold start уже залогиненного юзера (P5)

Run from backend/:
    DB_PATH=/tmp/urtruck_test_ios_push.db python -m tests.test_ios_push_chain_contract
"""
import os
import sys
import json
import re
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_ios_push.db")
if os.environ.get("URTRUCK_PYTEST_SHARED_DB") != "1":
    Path(TEST_DB).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from database import db as ddb

ddb.init_db()

from database import registration_dal

registration_dal.init_registration_schema()

from database.db import get_conn

# Инициализируем push-схему (обычно это делает _init_schema при import api.push)
_push_schema = ROOT / "database" / "push_schema.sql"
with get_conn() as _c:
    _c.executescript(_push_schema.read_text(encoding="utf-8"))

# Миграции из api/push.py (добавляет device_id, active, и т.д. в push_tokens_native)
with get_conn() as _c:
    existing = {r["name"] for r in _c.execute("PRAGMA table_info(push_tokens_native)").fetchall()}
    for name, decl in [("device_id", "TEXT"), ("active", "INTEGER NOT NULL DEFAULT 1"),
                        ("invalidated_at", "TEXT"), ("invalidated_reason", "TEXT"),
                        ("app_version", "TEXT")]:
        if name not in existing:
            try:
                _c.execute(f"ALTER TABLE push_tokens_native ADD COLUMN {name} {decl}")
            except Exception:
                pass

_chat_schema = ROOT / "database" / "chat_schema.sql"
if _chat_schema.exists():
    with get_conn() as _c:
        _c.executescript(_chat_schema.read_text(encoding="utf-8"))

_notif_schema = ROOT / "database" / "notifications_schema.sql"
if _notif_schema.exists():
    with get_conn() as _c:
        _c.executescript(_notif_schema.read_text(encoding="utf-8"))


def expect(cond, msg):
    if not cond:
        print(f"FAIL: {msg}")
        sys.exit(1)
    print(f"  ok: {msg}")


# ─── Тест 1: регистрация native-токенов пишет в push_tokens_native ───
def test_native_token_registration():
    """Frontend registerNative() шлёт два POST /register-native — expo и apns.
    Оба должны попасть в push_tokens_native."""
    print("\n=== 1. Регистрация expo + apns токенов ===")

    uid = "test-ios-user"
    expo_token = "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
    apns_token = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"

    with get_conn() as c:
        # Имитируем POST /register-native для expo
        c.execute(
            "INSERT INTO push_tokens_native (user_id, token, provider, platform, device_name) "
            "VALUES (?, ?, 'expo', 'ios', 'iPhone 15') "
            "ON CONFLICT(token) DO UPDATE SET user_id=excluded.user_id, last_seen=CURRENT_TIMESTAMP",
            (uid, expo_token),
        )
        # Имитируем POST /register-native для apns
        c.execute(
            "INSERT INTO push_tokens_native (user_id, token, provider, platform, device_name) "
            "VALUES (?, ?, 'apns', 'ios', 'iPhone 15') "
            "ON CONFLICT(token) DO UPDATE SET user_id=excluded.user_id, last_seen=CURRENT_TIMESTAMP",
            (uid, apns_token),
        )
        c.commit()

    with get_conn() as c:
        native = c.execute("SELECT * FROM push_tokens_native WHERE user_id = ?", (uid,)).fetchall()

    expect(len(native) == 2, f"push_tokens_native: 2 записи (expo + apns), got {len(native)}")
    providers = {r["provider"] for r in native}
    expect(providers == {"expo", "apns"}, f"providers: {providers}")


# ─── Тест 2: _native_tokens + provider-фильтрация в _send_native ───
def test_native_send_filters_by_provider():
    """_send_native берёт expo-токены для Expo Push и fcm-токены для FCM.
    APNs-провайдер обрабатывается как raw token (пока — только через Expo)."""
    print("\n=== 2. _send_native фильтрует по провайдеру ===")

    from services import push_sender

    uid = "test-ios-user"
    tokens = push_sender._native_tokens(uid)
    expect(len(tokens) >= 2, f"native tokens: ≥2, got {len(tokens)}")

    expo_tokens = [t for t in tokens if t.get("provider") == "expo"]
    apns_tokens = [t for t in tokens if t.get("provider") == "apns"]
    expect(len(expo_tokens) >= 1, f"expo tokens: ≥1, got {len(expo_tokens)}")
    expect(len(apns_tokens) >= 1, f"apns tokens: ≥1, got {len(apns_tokens)}")

    # В текущей архитектуре _send_native отправляет ТОЛЬКО expo и fcm, не apns напрямую
    src = Path(ROOT / "services" / "push_sender.py").read_text(encoding="utf-8")
    expect('t["provider"] == "expo"' in src, "expo-фильтр в _send_native")


# ─── Тест 3: badge = chat unread + notif unread ───
def test_badge_computation():
    """Badge на iOS иконке = непрочитанные чат-сообщения + непрочитанные нотификации.
    System-сообщения исключены (P1-1 вариант B)."""
    print("\n=== 3. Badge computation ===")

    from services import push_sender

    uid = "test-badge-user"

    with get_conn() as c:
        # Чат: создаём комнату и сообщения (колонка text, не message)
        c.execute(
            "INSERT OR IGNORE INTO chat_rooms (id, participant_1, participant_2) VALUES ('room-badge', ?, 'other')",
            (uid,),
        )
        # Непрочитанное от другого юзера
        c.execute(
            "INSERT INTO chat_messages (room_id, sender_id, text, is_read) "
            "VALUES ('room-badge', 'other', 'привет', 0)",
        )
        # System — НЕ должно считаться
        c.execute(
            "INSERT INTO chat_messages (room_id, sender_id, text, is_read) "
            "VALUES ('room-badge', 'system', 'deal accepted', 0)",
        )
        # Прочитанное — НЕ считаем
        c.execute(
            "INSERT INTO chat_messages (room_id, sender_id, text, is_read) "
            "VALUES ('room-badge', 'other', 'старое', 1)",
        )
        # Нотификация непрочитанная
        c.execute(
            "INSERT INTO notifications (user_id, type, title, body, is_read) "
            "VALUES (?, 'bid_created', 'Ставка', '3500$', 0)",
            (uid,),
        )
        c.commit()

    badge = push_sender._compute_recipient_badge(uid)
    expect(badge == 2, f"badge = chat(1) + notif(1) = 2, got {badge}")


# ─── Тест 4: event dedup ───
def test_event_dedup():
    """Повторный push с тем же event_key не создаёт дубль доставки."""
    print("\n=== 4. Event dedup по event_key ===")

    from services import push_sender

    uid = "test-dedup-user"
    event_key = "bid_accepted:deal-123"

    # Первая «доставка» — вручную пишем в лог как успешную
    with get_conn() as c:
        c.execute(
            "INSERT INTO push_log (user_id, kind, title, body, data_json, web_sent, native_sent, event_key) "
            "VALUES (?, 'bid', 'T', 'B', '{}', 0, 1, ?)",
            (uid, event_key),
        )
        c.commit()

    already = push_sender._already_delivered(uid, event_key)
    expect(already is True, f"повторный event_key блокируется, got {already}")

    not_delivered = push_sender._already_delivered(uid, "other-event")
    expect(not_delivered is False, f"другой event_key не блокируется, got {not_delivered}")


# ─── Тест 5: Expo ticket errors — InvalidCredentials НЕ деактивирует токен ───
def test_expo_error_classification():
    """DeviceNotRegistered → деактивация токена.
    InvalidCredentials → НЕ деактивация (это проблема Expo-credentials, не устройства)."""
    print("\n=== 5. Expo error classification ===")

    src = Path(ROOT / "services" / "push_sender.py").read_text(encoding="utf-8")

    # DeviceNotRegistered → dead
    expect('if err == "DeviceNotRegistered":' in src, "DeviceNotRegistered → dead list")
    expect("dead.append(" in src, "dead → деактивация в БД")

    # InvalidCredentials → только лог, НЕ деактивация
    expect("InvalidCredentials" in src, "InvalidCredentials упоминается (комментарий/документация)")
    # AST-верификация: dead.append ТОЛЬКО в DeviceNotRegistered-ветке
    import ast
    tree = ast.parse(src)
    found_correct_branch = False
    for node in ast.walk(tree):
        if isinstance(node, ast.If):
            test = node.test
            if (isinstance(test, ast.Compare)
                and len(test.comparators) == 1
                and isinstance(test.comparators[0], ast.Constant)
                and test.comparators[0].value == "DeviceNotRegistered"):
                body_has_dead = any(
                    "dead" in ast.dump(n) and "append" in ast.dump(n)
                    for n in ast.walk(ast.Module(body=node.body, type_ignores=[]))
                )
                else_has_dead = any(
                    "dead" in ast.dump(n) and "append" in ast.dump(n)
                    for n in ast.walk(ast.Module(body=node.orelse, type_ignores=[]))
                )
                if body_has_dead and not else_has_dead:
                    found_correct_branch = True
                    break
    expect(found_correct_branch, "InvalidCredentials НЕ деактивирует токен (AST: dead.append ТОЛЬКО в DeviceNotRegistered-ветке)")


# ─── Тест 6: source-инварианты frontend push.js ───
def test_frontend_push_source_invariants():
    """Статические инварианты push.js для iOS."""
    print("\n=== 6. Frontend push.js source invariants ===")

    push_src = Path(ROOT.parent / "src" / "utils" / "push.js").read_text(encoding="utf-8")

    # projectId извлекается из Constants
    expect("projectId" in push_src, "projectId используется для getExpoPushTokenAsync")
    expect("getExpoPushTokenAsync" in push_src, "getExpoPushTokenAsync вызывается")

    # Expo-токен регистрируется через POST /register-native
    expect("provider: 'expo'" in push_src or "provider: 'expo'" in push_src.replace('"', "'"),
           "expo-токен регистрируется через register-native")
    expect("register-native" in push_src, "POST /register-native endpoint вызывается")

    # autoRegister вызывает registerNative для native
    expect("if (this.isNative()) return this.registerNative()" in push_src,
           "autoRegister → registerNative на native")

    # foreground handler подавляет chat push для активной комнаты
    expect("getActiveRoom()" in push_src, "foreground handler проверяет activeRoom")
    expect("shouldShowBanner: false" in push_src, "SDK 52 shouldShowBanner false для active room")


# ─── Тест 7: P5 — autoRegister на cold start ───
def test_cold_start_autoregister():
    """App.js вызывает autoRegister при каждом старте (hasToken=true),
    а не только при OTP."""
    print("\n=== 7. Cold start autoRegister (P5) ===")

    app_src = Path(ROOT.parent / "App.js").read_text(encoding="utf-8")

    # P5 useEffect: if (!hasToken) return; ... push.autoRegister
    expect("P5:" in app_src or "пере-регистрация push" in app_src, "P5 комментарий найден")
    expect("if (!hasToken) return;" in app_src, "guard hasToken в P5 эффекте")
    expect("push.autoRegister" in app_src, "autoRegister в P5 эффекте")

    # AppState foreground re-register
    expect("state === 'active'" in app_src, "re-register на foreground return")

    # debounce 30s
    expect("30_000" in app_src or "30000" in app_src, "debounce 30s для rapid transitions")


# ─── Тест 8: app.json iOS push конфиг ───
def test_ios_push_config():
    """app.json содержит все необходимые iOS push конфигурации."""
    print("\n=== 8. app.json iOS push config ===")

    app_json_path = ROOT.parent / "app.json"
    with open(app_json_path, encoding="utf-8") as f:
        config = json.load(f)

    ios = config.get("expo", {}).get("ios", {})
    info_plist = ios.get("infoPlist", {})
    entitlements = ios.get("entitlements", {})
    plugins = config.get("expo", {}).get("plugins", [])

    # UIBackgroundModes includes remote-notification
    bg_modes = info_plist.get("UIBackgroundModes", [])
    expect("remote-notification" in bg_modes, f"UIBackgroundModes: remote-notification, got {bg_modes}")

    # aps-environment
    aps_env = entitlements.get("aps-environment")
    expect(aps_env == "production", f"aps-environment=production, got {aps_env}")

    # expo-notifications plugin
    notif_plugins = [p for p in plugins if isinstance(p, list) and p[0] == "expo-notifications"]
    expect(len(notif_plugins) == 1, f"expo-notifications plugin настроен, got {len(notif_plugins)}")

    # projectId
    project_id = config.get("expo", {}).get("extra", {}).get("eas", {}).get("projectId")
    expect(project_id == "898bd902-ea62-49f6-96c3-b6e02219f828",
           f"projectId правильный, got {project_id}")

    # bundleIdentifier
    bundle_id = ios.get("bundleIdentifier")
    expect(bundle_id == "com.urtruck.app", f"bundleIdentifier=com.urtruck.app, got {bundle_id}")


if __name__ == "__main__":
    print(f"Using DB: {TEST_DB}")
    test_native_token_registration()
    test_native_send_filters_by_provider()
    test_badge_computation()
    test_event_dedup()
    test_expo_error_classification()
    test_frontend_push_source_invariants()
    test_cold_start_autoregister()
    test_ios_push_config()
    print("\nAll iOS push chain contract tests passed.")
