"""Проверка распознавания и перевода голосового сообщения в общем чате."""
import uuid
from pathlib import Path

from database.db import get_conn


def _user(uid: str) -> dict:
    return {"id": uid, "full_name": uid, "phone": f"+7{uid[:6]}"}


def _mk_users(*uids):
    with get_conn() as c:
        for uid in uids:
            c.execute(
                "INSERT OR IGNORE INTO drivers_registration (id, full_name, phone, status, verification_level) "
                "VALUES (?, ?, ?, 'approved', 3)",
                (uid, uid, f"+7{uid[:6]}"),
            )


def _mk_deal(cargo_id: str, owner_id: str, driver_id: str, room_id: str) -> str:
    deal_id = "deal_" + uuid.uuid4().hex[:8]
    with get_conn() as c:
        c.execute(
            "INSERT INTO deals (id, cargo_id, trip_id, bid_id, shipper_id, driver_id, from_city, to_city, amount, status, chat_room_id) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (deal_id, cargo_id, None, "bid_" + uuid.uuid4().hex[:8], owner_id, driver_id, "Almaty", "Urumqi", 1500, "accepted", room_id),
        )
    return deal_id


def test_transcribe_voice_message_caches_transcript_and_translation(monkeypatch, tmp_path):
    # Import after the session fixture has initialized registration_schema.
    from api.chat import (
        SendMessageIn,
        TranscribeIn,
        TranslateIn,
        get_or_create_deal_room,
        send_message,
        transcribe_message,
        translate_message,
    )
    import api.chat as chat_module
    owner_id = "own_" + uuid.uuid4().hex[:6]
    driver_id = "drv_" + uuid.uuid4().hex[:6]
    _mk_users(owner_id, driver_id)
    cargo_id = "cg_" + uuid.uuid4().hex[:6]
    room_id = get_or_create_deal_room(cargo_id, owner_id, driver_id)
    _mk_deal(cargo_id, owner_id, driver_id, room_id)

    audio_path = tmp_path / "voice.webm"
    audio_path.write_bytes(b"fake-webm-audio")

    monkeypatch.setattr(chat_module, "send_to_user", lambda *args, **kwargs: 0)
    send_message(
        SendMessageIn(
            room_id=room_id,
            text="🎤 Voice message",
            photo_url=str(audio_path),
            is_voice=True,
            voice_duration=4,
            client_msg_id="cm_" + uuid.uuid4().hex[:8],
        ),
        user=_user(driver_id),
    )

    with get_conn() as c:
        msg = c.execute(
            "SELECT id FROM chat_messages WHERE room_id = ? ORDER BY id DESC LIMIT 1",
            (room_id,),
        ).fetchone()
    assert msg is not None
    message_id = msg["id"]

    calls = {"transcribe": 0, "translate": 0}

    def fake_transcribe(audio_ref, *, filename=None, language=None):
        calls["transcribe"] += 1
        assert Path(audio_ref) == audio_path
        return {
            "transcript_text": "司机现在什么意思？需要他们先垫付吗？",
            "source_lang": "zh",
            "provider": "openai",
        }

    def fake_translate(text, target_lang, source_lang=None):
        calls["translate"] += 1
        assert text == "司机现在什么意思？需要他们先垫付吗？"
        assert target_lang == "ru"
        assert source_lang == "zh"
        return {
            "translated_text": "Что водитель сейчас имеет в виду? Им нужно сначала оплатить?",
            "provider": "openai",
            "source_lang": "zh",
        }

    monkeypatch.setattr("services.speech_to_text_service.transcribe_audio_ref", fake_transcribe)
    monkeypatch.setattr("services.translate_service.translate_text", fake_translate)

    first = transcribe_message(TranscribeIn(message_id=message_id, target_lang="ru"), user=_user(owner_id))
    assert first["transcript_text"].startswith("司机现在什么意思")
    assert first["translated_text"].startswith("Что водитель")
    assert first["source_lang"] == "zh"
    assert calls == {"transcribe": 1, "translate": 1}

    second = transcribe_message(TranscribeIn(message_id=message_id, target_lang="ru"), user=_user(owner_id))
    assert second["translation_cached"] is True
    assert second["cached"] is True
    assert calls == {"transcribe": 1, "translate": 1}

    translated = translate_message(TranslateIn(message_id=message_id, target_lang="ru"), user=_user(owner_id))
    assert translated["original_text"].startswith("司机现在什么意思")
    assert translated["translated_text"].startswith("Что водитель")

    with get_conn() as c:
        row = c.execute(
            "SELECT voice_transcript, voice_transcript_lang, voice_transcript_provider FROM chat_messages WHERE id = ?",
            (message_id,),
        ).fetchone()
    assert row["voice_transcript"].startswith("司机现在什么意思")
    assert row["voice_transcript_lang"] == "zh"
    assert row["voice_transcript_provider"] == "openai"
