import os
from pathlib import Path

os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_push_localization.db")
Path(os.environ["DB_PATH"]).unlink(missing_ok=True)

from database import db
db.init_db()
from services.push_sender import _SYSTEM_PUSH_COPY, _localize_system_copy


def test_system_push_catalog_covers_supported_locales(monkeypatch):
    for locale in ("RU", "EN", "KK", "ZH"):
        monkeypatch.setattr(
            "services.push_sender._recipient_locale",
            lambda _uid, value=locale: value,
        )
        title, body = _localize_system_copy(
            "recipient", "bid_accepted", "old title", "old body",
            {"amount": "1000 KZT", "from_city": "Алматы", "to_city": "Астана"},
        )
        assert title == _SYSTEM_PUSH_COPY[locale]["bid_accepted"][0]
        assert "1000 KZT" in body
        assert "Алматы" in body and "Астана" in body


def test_unknown_locale_falls_back_to_russian_without_changing_payload():
    title, body = _localize_system_copy(
        "recipient", "deal_status", "old title", "old body",
        {"status": "in_progress", "route": "CN → KZ"},
    )
    assert title == _SYSTEM_PUSH_COPY["RU"]["deal_status"][0]
    assert "CN → KZ" in body


def test_chat_user_content_is_not_localized(monkeypatch):
    monkeypatch.setattr("services.push_sender._recipient_locale", lambda _uid: "ZH")
    assert _localize_system_copy("recipient", "chat", "💬 User", "Алматы", {}) == ("💬 User", "Алматы")
