"""Отказ подписи вложений не скрывает историю и не раскрывает приватные ref."""
import uuid

import httpx
import pytest
from fastapi import HTTPException

from api import chat
from database.db import get_conn


@pytest.fixture
def history_room():
    owner, driver = (uuid.uuid4().hex for _ in range(2))
    cargo = uuid.uuid4().hex
    room = chat.get_or_create_deal_room(cargo, owner, driver)
    with get_conn() as c:
        c.execute(
            "INSERT INTO deals (id, cargo_id, bid_id, shipper_id, driver_id, "
            "from_city, to_city, amount, status, chat_room_id) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (uuid.uuid4().hex, cargo, uuid.uuid4().hex, owner, driver,
             "Almaty", "Moscow", 1000, "accepted", room),
        )
        for text, ref in [("before", None), ("photo", "/storage/chat/photo.jpg"),
                          ("voice", "/storage/chat/voice.m4a"), ("after", None)]:
            c.execute(
                "INSERT INTO chat_messages (room_id, sender_id, text, photo_url, is_voice) "
                "VALUES (?,?,?,?,?)", (room, driver, text, ref, int(text == "voice")),
            )
    return room, owner


def test_timeout_preserves_history_without_private_urls(history_room, monkeypatch):
    room, owner = history_room
    calls = []

    def unavailable(ref):
        calls.append(ref)
        raise httpx.ReadTimeout("private upstream details must not be returned")

    monkeypatch.setattr(chat.file_signing, "sign", unavailable)
    result = chat.get_messages(room, user={"id": owner})
    assert [m["text"] for m in result["messages"]] == ["before", "photo", "voice", "after"]
    assert len(calls) == 1  # Не ждём полный timeout для каждого файла.
    for m in result["messages"][1:3]:
        assert m["photo_url"] is None
        assert m["attachment_unavailable"] is True
    assert result["messages"][2]["is_voice"] == 1
    assert "private upstream details" not in str(result)

    # Следующий запрос восстанавливает вложения; исходники в БД не менялись.
    monkeypatch.setattr(chat.file_signing, "sign", lambda ref: ref + "?test_signed=1")
    recovered = chat.get_messages(room, user={"id": owner})["messages"]
    for m in recovered[1:3]:
        assert m["photo_url"].endswith("?test_signed=1")
        assert m["attachment_unavailable"] is False
    with get_conn() as c:
        refs = [r[0] for r in c.execute(
            "SELECT photo_url FROM chat_messages WHERE room_id=? AND photo_url IS NOT NULL", (room,))]
    assert refs == ["/storage/chat/photo.jpg", "/storage/chat/voice.m4a"]


def test_foreign_user_is_rejected_before_signing(history_room, monkeypatch):
    room, _ = history_room
    calls = []
    monkeypatch.setattr(chat.file_signing, "sign", lambda ref: calls.append(ref))
    with pytest.raises(HTTPException) as error:
        chat.get_messages(room, user={"id": "stranger"})
    assert error.value.status_code == 403
    assert calls == []


def test_missing_signing_configuration_still_fails_closed(history_room, monkeypatch):
    room, owner = history_room

    def unconfigured(ref):
        raise chat.file_signing.FileSigningConfigurationError("missing key")

    monkeypatch.setattr(chat.file_signing, "sign", unconfigured)
    result = chat.get_messages(room, user={"id": owner})
    assert all(m["photo_url"] is None for m in result["messages"])
    assert len(result["messages"]) == 4
