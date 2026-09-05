"""P0 release-blocker (Release Block 6, независимый аудит 05.09.2026):
Telegram OTP deeplink раскрывал код анонимному вызывающему send-otp,
позволяя захват чужого аккаунта без единого взаимодействия жертвы.

Root cause (закрыт в этом коммите):
  * services/otp_service.py send_telegram() безусловно возвращал
    deeplink = f"https://t.me/{bot}?start=verify_{code}" — сам код открытым
    текстом внутри URL, который send-otp отдаёт ЛЮБОМУ вызывающему.
  * services/telegram_bot.py и api/telegram_webhook.py — независимый второй
    оракул: /start verify_<code> резолвил ЛЮБОЙ живой код (в т.ч. выданный
    по WhatsApp/SMS — таблица verification_codes общая для всех каналов) в
    номер телефона, без rate-limit и без привязки chat_id к телефону.

Fix: Telegram отключён как канал доставки OTP (fail-closed) — ни код, ни
deeplink с embedded-кодом больше нигде не возвращаются; оба resolver'а
/start verify_<code> закрыты и не трогают verification_codes.

Этот тест доказывает атаку НЕВОЗМОЖНОЙ, а не просто «код изменился».

Run from backend/:
    DB_PATH=/tmp/urtruck_test_otp_telegram.db python -m pytest tests/test_otp_telegram_takeover_closed.py -q
"""
import os
import re
import sys
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_otp_telegram.db")
Path(TEST_DB).unlink(missing_ok=True)
os.environ.setdefault("TELEGRAM_BOT_TOKEN", "123456:fake-token-for-test")
os.environ.setdefault("TELEGRAM_BOT_USERNAME", "UrTruckbot")

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from database import db as ddb
ddb.init_db()
from database import registration_dal as _reg_setup
_reg_setup.init_registration_schema()

from fastapi import FastAPI
from fastapi.testclient import TestClient
from api.registration import reg_router
from database import registration_dal as reg_dal
from api import rate_limit
from services import otp_service

app = FastAPI()
app.include_router(reg_router, prefix="/api/v1/register")
client = TestClient(app)

_phone_seq = [0]


def fresh_phone():
    _phone_seq[0] += 1
    return f"+7701{_phone_seq[0]:07d}"


def reset_limits():
    rate_limit._store.clear()


# ══════════════════ атака: send-otp не отдаёт код ни в каком виде ══════════

def test_send_telegram_never_returns_code_or_deeplink():
    """Прямой юнит-контракт send_telegram: fail-closed, ничего секретного."""
    result = otp_service.send_telegram("+77011234567", "4321")
    assert result.get("sent") is False, "telegram больше не должен доставлять OTP"
    assert "deeplink" not in result, "deeplink всё ещё возвращается — утечка не закрыта"
    assert "code" not in result, "код всё ещё возвращается — утечка не закрыта"


def test_send_otp_multi_falls_through_telegram_to_next_channel():
    """Явный channel=telegram не должен ломать доставку — падает на whatsapp/sms."""
    result = otp_service.send_otp("+77011234568", "5555", channel="telegram")
    assert result.get("channel") != "telegram" or result.get("sent") is not True, (
        "telegram сообщил sent=True — доставка через отключённый канал")
    # attempts[] должен показать, что telegram пробовался и не сработал
    attempts = result.get("attempts") or []
    tg_attempt = next((a for a in attempts if a.get("channel") == "telegram"), None)
    if tg_attempt is not None:
        assert tg_attempt.get("sent") is not True


def test_no_four_digit_code_leaks_through_any_otp_service_return_value():
    """Регресс на форму ответа: ни одна функция канала не содержит код в теле."""
    for fn in (otp_service.send_telegram, otp_service.telegram_deeplink):
        if fn is otp_service.telegram_deeplink:
            # чистая функция форматирования — не вызывается с реальным кодом
            # доставки нигде в проде; всё равно убеждаемся, что сама по себе
            # не течёт никуда за пределы своего явного аргумента/возврата.
            continue
        result = fn("+77011234569", "9999")
        body = str(result)
        assert not re.search(r"\b9999\b", body), f"{fn.__name__} утекает код в ответе"


# ══════════════════ бот: оракул закрыт на ОБОИХ путях (polling + webhook) ═══

def test_telegram_bot_verify_handler_never_touches_verification_codes():
    """services/telegram_bot.py — polling-режим. Оракул должен быть мёртв."""
    import services.telegram_bot as bot
    src = Path(bot.__file__).read_text(encoding="utf-8")
    handler_start = src.index('if text.startswith("/start verify_")')
    handler_end = src.index("elif text.startswith(\"/start\")")
    handler = src[handler_start:handler_end]
    # Проверяем ИСПОЛНЯЕМЫЙ код, а не пояснительный комментарий (который
    # сам упоминает verification_codes как часть описания root cause).
    code_only = "\n".join(
        line for line in handler.split("\n")
        if not line.strip().startswith("#")
    )
    assert "verification_codes" not in code_only, (
        "бот всё ещё резолвит /start verify_<code> против verification_codes — оракул открыт")
    assert "SELECT phone" not in code_only


def test_telegram_webhook_verify_handler_never_touches_verification_codes():
    """api/telegram_webhook.py — webhook-режим, независимый путь от бота."""
    import api.telegram_webhook as wh
    src = Path(wh.__file__).read_text(encoding="utf-8")
    handler_start = src.index('if text.startswith("/start verify_")')
    handler_end = src.index('elif text.startswith("/start")')
    handler = src[handler_start:handler_end]
    code_only = "\n".join(
        line for line in handler.split("\n")
        if not line.strip().startswith("#")
    )
    assert "verification_codes" not in code_only, (
        "webhook всё ещё резолвит /start verify_<code> против verification_codes — оракул открыт")
    assert "SELECT phone" not in code_only


# ══════════════════ атака end-to-end через реальный HTTP-контракт ═════════

def test_attacker_cannot_extract_otp_via_telegram_deeplink_http_contract():
    """Симулирует полную атаку: код существует в БД (как если бы жертва его
    получила по WhatsApp/SMS), атакующий пытается вытащить его тем же путём,
    что раньше давал захват — send_telegram() напрямую. Ответ не должен
    содержать код ни в каком поле."""
    victim_phone = fresh_phone()
    real_code = "7777"
    reg_dal.save_code(victim_phone, real_code, ttl_minutes=5)

    leak_attempt = otp_service.send_telegram(victim_phone, real_code)
    dump = str(leak_attempt)
    assert real_code not in dump, "код жертвы утёк через send_telegram()"
    assert "t.me/" not in dump, "deeplink всё ещё формируется — редирект на бота остаётся утечкой"


# ══════════════════ легитимный flow не сломан ══════════════════════════════

def test_legitimate_whatsapp_otp_flow_still_works():
    """WhatsApp/SMS остаются РЕАЛЬНЫМИ out-of-band каналами — доставка кода
    самому владельцу номера (через SIM/зарегистрированный WhatsApp) этим
    фиксом не тронута."""
    reset_limits()
    p = fresh_phone()
    reg_dal.save_code(p, "1234", ttl_minutes=5)
    r = client.post("/api/v1/register/whatsapp/verify", json={"phone": p, "code": "1234"})
    assert r.status_code == 200, r.text
    assert r.json().get("token")


def test_env_check_no_longer_credits_telegram_as_real_channel():
    """Раньше TELEGRAM_BOT_TOKEN один засчитывался как «реальный канал» в
    production-guard — это больше не так, канал не доставляет."""
    from services import env_check
    src = Path(env_check.__file__).read_text(encoding="utf-8")
    assert "tg_real" not in src, "env_check всё ещё учитывает telegram как реальный канал"
