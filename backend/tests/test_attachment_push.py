import asyncio
import io

from fastapi import UploadFile

from api import deal_room


class _Row(dict):
    pass


class _Connection:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, _sql, _params):
        return self

    def fetchone(self):
        return _Row(participant_1="driver-1", participant_2="shipper-1")


def test_attachment_notifies_the_other_participant(monkeypatch):
    """A successfully uploaded document must notify the opposite room user."""
    sent = []
    monkeypatch.setattr(deal_room.dr, "room_exists", lambda _room_id: True)
    monkeypatch.setattr(deal_room.dr, "is_participant", lambda _room_id, _user_id: True)
    monkeypatch.setattr(deal_room.storage_service, "save_image", lambda *_args, **_kwargs: "/storage/document.pdf")
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
            user={"id": "driver-1"},
        )
    )

    assert result["attachment"]["id"] == "attachment-1"
    assert len(sent) == 1
    args, kwargs = sent[0]
    assert args[0] == "shipper-1"
    assert kwargs["kind"] == "chat"
    assert kwargs["data"] == {
        "type": "chat_attachment",
        "room_id": "room-1",
        "attachment_id": "attachment-1",
        "sender_id": "driver-1",
        "recipient_id": "shipper-1",
    }
