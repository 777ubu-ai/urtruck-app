"""SEC-005 targeted Telegram OTP exfiltration regression tests."""
from __future__ import annotations

import os
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_telegram_otp_security.db")
os.environ.setdefault("URTRUCK_ENV", "production")
os.environ.setdefault("BETA_MODE", "false")
os.environ.setdefault("TELEGRAM_BOT_TOKEN", "test-bot-token")
os.environ.setdefault("TELEGRAM_WEBHOOK_SECRET", "w" * 48)
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from database import db as ddb
from database import registration_dal as reg_dal
from database.db import get_conn
from api import telegram_webhook
from services import telegram_bot, telegram_otp


ddb.init_db()
reg_dal.init_registration_schema()
app = FastAPI()
app.include_router(telegram_webhook.tg_webhook_router, prefix="/api/v1/telegram")
client = TestClient(app)
SECRET = "w" * 48
HEADERS = {"X-Telegram-Bot-Api-Secret-Token": SECRET}


@pytest.fixture(autouse=True)
def _clean_state(monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "test-bot-token")
    monkeypatch.setenv("TELEGRAM_WEBHOOK_SECRET", SECRET)
    monkeypatch.setenv("TELEGRAM_POLLING_ENABLED", "false")
    with get_conn() as c:
        c.execute("DELETE FROM telegram_otp_rate_limits")
        c.execute("DELETE FROM telegram_otp_challenges")
        c.execute("DELETE FROM verification_codes")


def _message(actor: int, *, text: str | None = None, contact: dict | None = None, chat_id=None):
    message = {
        "from": {"id": actor},
        "chat": {"id": actor if chat_id is None else chat_id, "type": "private"},
    }
    if text is not None:
        message["text"] = text
    if contact is not None:
        message["contact"] = contact
    return message


def _post(message: dict, headers=HEADERS):
    return client.post("/api/v1/telegram/webhook", headers=headers, json={"message": message})


def _challenge(phone="+77000000001", code="4187"):
    reg_dal.save_code(phone, code)
    link = telegram_otp.create_challenge(phone, code)
    payload = parse_qs(urlparse(link).query)["start"][0]
    assert payload.startswith("verify_")
    return payload[len("verify_"):], phone, code, link


def _capture(monkeypatch):
    sent = []

    def send(chat_id, text, **kwargs):
        sent.append({"chat_id": str(chat_id), "text": text, **kwargs})
        return True

    monkeypatch.setattr(telegram_webhook, "_send_message", send)
    return sent


def test_missing_secret_or_token_disables_webhook(monkeypatch):
    token, _, code, _ = _challenge()
    monkeypatch.delenv("TELEGRAM_WEBHOOK_SECRET")
    response = _post(_message(1001, text=f"/start verify_{token}"), headers={})
    assert response.status_code == 503
    assert code not in response.text
    assert telegram_webhook._verify_telegram_signature("") is False

    monkeypatch.setenv("TELEGRAM_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN")
    assert _post(_message(1001, text=f"/start verify_{token}"), headers=HEADERS).status_code == 503


def test_forged_webhook_is_denied_before_processing(monkeypatch):
    token, _, code, _ = _challenge()
    sent = _capture(monkeypatch)
    response = _post(
        _message(1002, text=f"/start verify_{token}"),
        headers={"X-Telegram-Bot-Api-Secret-Token": "wrong"},
    )
    assert response.status_code == 403
    assert sent == []
    assert code not in response.text


def test_deep_link_is_high_entropy_and_does_not_embed_otp_or_phone():
    token, phone, code, link = _challenge()
    assert len(token) >= 40
    assert code not in link
    assert phone not in link
    with get_conn() as c:
        row = c.execute("SELECT token_hash, phone FROM telegram_otp_challenges").fetchone()
    assert row["token_hash"] != token
    assert len(row["token_hash"]) == 64


def test_wrong_chat_actor_cannot_bind_or_receive_otp(monkeypatch):
    token, _, code, _ = _challenge()
    sent = _capture(monkeypatch)
    response = _post(_message(1003, chat_id=9999, text=f"/start verify_{token}"))
    assert response.status_code == 200
    assert response.json()["status"] == "actor_mismatch"
    assert sent == []
    with get_conn() as c:
        state = c.execute("SELECT state FROM telegram_otp_challenges").fetchone()["state"]
    assert state == "pending"
    assert code not in response.text


def test_wrong_contact_actor_and_wrong_phone_are_denied(monkeypatch):
    token, _, code, _ = _challenge()
    sent = _capture(monkeypatch)
    actor = 1004
    assert _post(_message(actor, text=f"/start verify_{token}")).json()["status"] == "awaiting_contact"

    wrong_actor = _post(
        _message(actor, contact={"user_id": 4444, "phone_number": "+77000000001"})
    )
    assert wrong_actor.json()["status"] == "contact_actor_mismatch"
    wrong_phone = _post(
        _message(actor, contact={"user_id": actor, "phone_number": "+77000000099"})
    )
    assert wrong_phone.json()["status"] == "phone_mismatch"
    assert all(code not in item["text"] for item in sent)


def test_expired_challenge_is_denied(monkeypatch):
    token, phone, code, _ = _challenge()
    sent = _capture(monkeypatch)
    actor = 1005
    assert _post(_message(actor, text=f"/start verify_{token}")).json()["status"] == "awaiting_contact"
    with get_conn() as c:
        c.execute("UPDATE telegram_otp_challenges SET expires_at='2000-01-01T00:00:00'")
    response = _post(_message(actor, contact={"user_id": actor, "phone_number": phone}))
    assert response.json()["status"] == "expired"
    assert all(code not in item["text"] for item in sent)


def test_valid_bound_flow_is_one_time_and_replay_safe(monkeypatch):
    token, phone, code, _ = _challenge()
    sent = _capture(monkeypatch)
    actor = 1006
    started = _post(_message(actor, text=f"/start verify_{token}"))
    assert started.json()["status"] == "awaiting_contact"
    assert sent[-1]["reply_markup"]["keyboard"][0][0]["request_contact"] is True
    assert code not in sent[-1]["text"]

    contact = _message(actor, contact={"user_id": actor, "phone_number": phone.lstrip("+")})
    consumed = _post(contact)
    replay = _post(contact)
    assert consumed.json()["status"] == "consumed"
    assert replay.json()["status"] == "invalid"
    assert sum(code in item["text"] for item in sent) == 1
    with get_conn() as c:
        row = c.execute("SELECT state, consumed_at FROM telegram_otp_challenges").fetchone()
    assert row["state"] == "consumed"
    assert row["consumed_at"]


def test_expired_otp_cannot_be_recovered_from_live_challenge(monkeypatch):
    token, phone, code, _ = _challenge()
    sent = _capture(monkeypatch)
    actor = 1007
    assert _post(_message(actor, text=f"/start verify_{token}")).json()["status"] == "awaiting_contact"
    with get_conn() as c:
        c.execute("UPDATE verification_codes SET expires_at='2000-01-01T00:00:00'")
    response = _post(_message(actor, contact={"user_id": actor, "phone_number": phone}))
    assert response.json()["status"] == "expired"
    assert all(code not in item["text"] for item in sent)


def test_persistent_actor_rate_limit_blocks_bruteforce(monkeypatch):
    sent = _capture(monkeypatch)
    actor = 1008
    statuses = []
    for index in range(6):
        fake = ("A" * 42) + str(index)
        statuses.append(_post(_message(actor, text=f"/start verify_{fake}")).json()["status"])
    assert statuses[:5] == ["invalid"] * 5
    assert statuses[5] == "rate_limited"
    with get_conn() as c:
        row = c.execute("SELECT attempts, blocked_until FROM telegram_otp_rate_limits").fetchone()
    assert row["attempts"] == 5
    assert row["blocked_until"]
    assert any("Слишком много" in item["text"] for item in sent)


def test_polling_uses_same_binding_and_does_not_log_pii(monkeypatch, capsys):
    monkeypatch.delenv("TELEGRAM_WEBHOOK_SECRET")
    monkeypatch.setenv("TELEGRAM_POLLING_ENABLED", "true")
    token, phone, code, _ = _challenge(phone="+77000000002", code="5298")
    sent = []
    monkeypatch.setattr(
        telegram_bot,
        "_send",
        lambda chat_id, text, **kwargs: sent.append({"text": text, **kwargs}),
    )
    actor = 1009
    assert telegram_bot._handle_message(_message(actor, text=f"/start verify_{token}")) == "awaiting_contact"
    assert telegram_bot._handle_message(
        _message(actor, contact={"user_id": actor, "phone_number": phone})
    ) == "consumed"
    assert sum(code in item["text"] for item in sent) == 1
    output = capsys.readouterr().out
    assert code not in output
    assert phone not in output
    assert str(actor) not in output


def test_polling_is_disabled_by_default_without_sensitive_logs(monkeypatch, capsys):
    monkeypatch.delenv("TELEGRAM_WEBHOOK_SECRET")
    monkeypatch.delenv("TELEGRAM_POLLING_ENABLED")
    monkeypatch.setattr(telegram_bot, "_running", False)
    assert telegram_bot.start_bot() is False
    output = capsys.readouterr().out
    assert "Polling disabled" in output
    assert os.environ["TELEGRAM_BOT_TOKEN"] not in output
