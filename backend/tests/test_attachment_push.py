import asyncio
import io

from fastapi import UploadFile

from api import deal_room


class _Row(dict):
    pass


class _Connection:
    """Route fetch results by statement — upload_attachment() now runs a
    PRAGMA probe, a post-insert SELECT of the attachment row, and a
    chat_rooms participants lookup, all through the same connection."""

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, sql, _params=None):
        self._last_sql = sql
        return self

    def fetchone(self):
        sql = getattr(self, "_last_sql", "")
        if "chat_rooms" in sql:
            return _Row(participant_1="driver-1", participant_2="shipper-1")
        if "message_attachments" in sql:
            return _Row(id="attachment-1", url="/storage/document.pdf")
        return None

    def fetchall(self):
        # _ensure_attachment_columns() only probes PRAGMA table_info(); an
        # empty result makes it (harmlessly, against this mock) attempt the
        # idempotent ALTER/CREATE INDEX statements, all no-ops here.
        return []


def test_attachment_notifies_the_other_participant(monkeypatch):
    """A successfully uploaded document must notify the opposite room user."""
    sent = []
    monkeypatch.setattr(deal_room.dr, "room_exists", lambda _room_id: True)
    monkeypatch.setattr(deal_room.dr, "is_participant", lambda _room_id, _user_id: True)
    # Third authorization step, added 2026-09-14 (P1 deal-room status gate).
    # Stubbed for exactly the same reason room_exists/is_participant above
    # are: this test isolates "a successful upload notifies the counterparty"
    # and deliberately models no deals/chat_rooms rows (get_conn is the fake
    # _Connection above). The gate's own behaviour — including that a
    # cancelled/rejected deal must close this endpoint — is covered by
    # tests/test_deal_room_status_gate.py.
    monkeypatch.setattr(deal_room, "_assert_deal_room_open", lambda _room_id, _user_id: None)
    monkeypatch.setattr(deal_room.storage_service, "save_file", lambda *_args, **_kwargs: "/storage/document.pdf")
    monkeypatch.setattr(
        deal_room.dr,
        "create_attachment",
        lambda **_kwargs: {"id": "attachment-1", "url": "/storage/document.pdf"},
    )
    monkeypatch.setattr(deal_room.file_signing, "sign", lambda url: url)
    monkeypatch.setattr(deal_room, "get_conn", lambda: _Connection())
    monkeypatch.setattr(deal_room, "send_to_user", lambda *args, **kwargs: sent.append((args, kwargs)))

    upload = UploadFile(filename="invoice.pdf", file=io.BytesIO(b"%PDF-1.7\n"))
    upload.headers = {"content-type": "application/pdf"}
    result = asyncio.run(
        deal_room.upload_attachment(
            conversation_id="room-1",
            file=upload,
            kind="document",
            client_upload_id=None,
            user={"id": "driver-1"},
        )
    )

    assert result["attachment"]["id"] == "attachment-1"
    assert len(sent) == 1
    args, kwargs = sent[0]
    assert args[0] == "shipper-1"
    assert kwargs["kind"] == "chat"
    # Push-closure track: data now also carries event_key/event for durable
    # outbox retry (see api/deal_room.py upload_attachment).
    assert kwargs["data"] == {
        "type": "chat_attachment",
        "room_id": "room-1",
        "attachment_id": "attachment-1",
        "sender_id": "driver-1",
        "recipient_id": "shipper-1",
        "event_key": "chat:room-1:attachment:attachment-1",
        "event": "chat.attachment",
        "i18n_event": "chat_attachment",
        "i18n_params": {"filename": "invoice.pdf"},
    }


def test_attachment_push_uses_recipient_language_without_translating_filename():
    from services.push_i18n import push_text
    name = "Накладная №17 {invoice}.pdf"
    expected = {"RU": "Новый документ", "KK": "Жаңа құжат", "ZH": "新文件", "EN": "New document"}
    for locale, title in expected.items():
        result = push_text("chat_attachment", locale, filename=name)
        assert title in result[0]
        assert result[1] == name
    assert push_text("chat_photo", "zh-Hans-CN") == ("📷 照片", "收到新照片")
