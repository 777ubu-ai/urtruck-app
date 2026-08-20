import os
import sys
from pathlib import Path

DB_PATH = "/tmp/urtruck_test_deal_attachment_upload.db"
os.environ["ENV"] = "test"
os.environ["DB_PATH"] = DB_PATH
os.environ["STORAGE_PROVIDER"] = "local"
Path(DB_PATH).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from database import db
from database import deal_room_dal as dr
from api import deal_room
from services import storage_service


def setup_module():
    db.init_db()
    dr.init_deal_room_schema()
    deal_room._ensure_attachment_columns()


def setup_function():
    with db.get_conn() as c:
        c.execute("DELETE FROM message_attachments")


def test_pdf_magic_bytes_are_authoritative():
    assert deal_room._sniff_mime(b"%PDF-1.7\nhello") == "application/pdf"
    assert deal_room._sniff_mime(b"\xff\xd8\xffhello") == "image/jpeg"
    assert deal_room._sniff_mime(b"PK\x03\x04hello") == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    assert deal_room._sniff_mime(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1hello") == "application/vnd.ms-excel"
    assert deal_room._sniff_mime(b"name,price\nboots,8400\n") == "text/csv"
    assert deal_room._sniff_mime(b"not-a-supported-file") is None


def test_unicode_filename_is_preserved_without_paths_or_controls():
    result = deal_room._safe_original_name("../../Платежное_поручение_№10 (2).pdf\x00", "pdf")
    assert result == "Платежное_поручение_№10 (2).pdf"
    assert "/" not in result
    assert "\x00" not in result


def test_retry_reservation_is_atomic_and_deduplicated():
    first, created = deal_room._reserve_attachment(
        conversation_id="room-1",
        uploader_id="user-1",
        client_upload_id="att-stable-1",
        message_id=None,
        kind="document",
        mime_type="application/pdf",
        size_bytes=1234,
        original_name="Платежное.pdf",
    )
    assert created is True
    assert first["upload_status"] == "uploading"

    second, created_again = deal_room._reserve_attachment(
        conversation_id="room-1",
        uploader_id="user-1",
        client_upload_id="att-stable-1",
        message_id=None,
        kind="document",
        mime_type="application/pdf",
        size_bytes=1234,
        original_name="Платежное.pdf",
    )
    assert created_again is False
    assert second["id"] == first["id"]

    completed = deal_room._complete_attachment_reservation(first["id"], "/storage/chat_attachments/a.pdf")
    assert completed["upload_status"] == "uploaded"
    assert completed["client_upload_id"] == "att-stable-1"
    assert completed["original_name"] == "Платежное.pdf"

    with db.get_conn() as c:
        count = c.execute(
            "SELECT COUNT(*) AS n FROM message_attachments WHERE client_upload_id = ?",
            ("att-stable-1",),
        ).fetchone()["n"]
    assert count == 1


def test_storage_preserves_pdf_content_type(monkeypatch):
    seen = {}

    class Response:
        def raise_for_status(self):
            return None

    def fake_post(url, headers=None, content=None, timeout=None):
        seen["url"] = url
        seen["headers"] = headers or {}
        seen["content"] = content
        return Response()

    monkeypatch.setattr(storage_service.httpx, "post", fake_post)
    monkeypatch.setattr(storage_service, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(storage_service, "SUPABASE_KEY", "secret")
    monkeypatch.setattr(storage_service, "SUPABASE_BUCKET", "private")

    ref = storage_service._save_supabase(b"%PDF-1.7\n", "chat_attachments/test.pdf", "application/pdf")
    assert seen["headers"]["Content-Type"] == "application/pdf"
    assert ref == "supabase://private/chat_attachments/test.pdf"
