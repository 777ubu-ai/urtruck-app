"""Regression tests for C1.2 upload security.

Covers the shared validator (services/upload_validation) and the endpoints
that now enforce it: registration photos (413/415), chat photo/voice
(magic bytes instead of filename), profile PRO-documents (sniffed not
declared MIME), and deal-room delegation to the same module.
"""
import asyncio
import io
import os
import sys
from pathlib import Path

os.environ.setdefault("ENV", "test")
os.environ.setdefault("STORAGE_PROVIDER", "local")

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import pytest
from fastapi import HTTPException, UploadFile

from services import upload_validation as uv


JPEG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 64
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
WEBP_BYTES = b"RIFF" + b"\x24\x00\x00\x00" + b"WEBP" + b"\x00" * 32
PDF_BYTES = b"%PDF-1.7\n" + b"\x00" * 32
MP3_BYTES = b"ID3\x04\x00\x00\x00\x00\x00\x00" + b"\x00" * 64
WEBM_BYTES = b"\x1a\x45\xdf\xa3" + b"\x00" * 64
M4A_BYTES = b"\x00\x00\x00\x18ftypM4A " + b"\x00" * 64


def _upload(data: bytes, filename: str = "photo.jpg", content_type: str = "image/jpeg") -> UploadFile:
    up = UploadFile(filename=filename, file=io.BytesIO(data))
    up.headers = {"content-type": content_type}
    return up


# ── Unit: validator ────────────────────────────────────────────────────────
def test_validate_image_bytes_accepts_jpeg_and_png():
    ext, mime = uv.validate_image_bytes(JPEG_BYTES)
    assert (ext, mime) == ("jpg", "image/jpeg")
    ext, mime = uv.validate_image_bytes(PNG_BYTES)
    assert (ext, mime) == ("png", "image/png")


def test_validate_image_bytes_oversized_raises_413():
    with pytest.raises(uv.UploadValidationError) as exc:
        uv.validate_image_bytes(JPEG_BYTES + b"\x00" * uv.MAX_REGISTRATION_IMAGE_BYTES)
    assert exc.value.status_code == 413


def test_validate_image_bytes_wrong_magic_raises_415():
    with pytest.raises(uv.UploadValidationError) as exc:
        uv.validate_image_bytes(PDF_BYTES)
    assert exc.value.status_code == 415
    with pytest.raises(uv.UploadValidationError) as exc2:
        uv.validate_image_bytes(b"")
    assert exc2.value.status_code == 400


def test_sniff_pro_doc_accepts_webp():
    assert uv.sniff_pro_doc_mime(WEBP_BYTES) == "image/webp"
    assert uv.sniff_pro_doc_mime(PDF_BYTES) is None


def test_sniff_audio_variants_and_rejection():
    assert uv.sniff_audio_mime(MP3_BYTES) == ("mp3", "audio/mpeg")
    assert uv.sniff_audio_mime(WEBM_BYTES) == ("webm", "audio/webm")
    assert uv.sniff_audio_mime(M4A_BYTES) == ("m4a", "audio/mp4")
    assert uv.sniff_audio_mime(b"\xff\xfb\x90\x44" + b"\x00" * 16) == ("mp3", "audio/mpeg")
    assert uv.sniff_audio_mime(b"RIFF\x24\x08\x00\x00WAVE" + b"\x00" * 16) == ("wav", "audio/wav")
    assert uv.sniff_audio_mime(b"OggS\x00\x02" + b"\x00" * 16) == ("ogg", "audio/ogg")
    assert uv.sniff_audio_mime(b"\xff\xf1\x50\x80" + b"\x00" * 16) == ("aac", "audio/aac")
    assert uv.sniff_audio_mime(b"MZ\x90\x00" + b"\x00" * 16) is None
    assert uv.sniff_audio_mime(PDF_BYTES) is None


def test_sanitize_original_name_strips_traversal_and_controls():
    assert uv.sanitize_original_name("../../etc/passwd\x00.txt", "txt") == "passwd.txt"
    assert uv.sanitize_original_name("..\\..\\Windows\\system.ini", "ini") == "system.ini"
    assert "/" not in uv.sanitize_original_name("a/b/c.pdf", "pdf")
    assert uv.sanitize_original_name("", "pdf") == "document.pdf"
    assert uv.sanitize_original_name("Платёжка (2).pdf", "pdf") == "Платёжка (2).pdf"
    assert len(uv.sanitize_original_name("x" * 500, "pdf")) == 180


def test_declared_contradiction_check():
    assert uv.declared_contradicts_sniffed("image/png", "image/jpeg") is True
    assert uv.declared_contradicts_sniffed("image/jpg", "image/jpeg") is False
    assert uv.declared_contradicts_sniffed("application/octet-stream", "image/png") is False
    assert uv.declared_contradicts_sniffed("", "image/png") is False
    assert uv.declared_contradicts_sniffed(None, "image/png") is False


# ── Registration endpoints ─────────────────────────────────────────────────
def test_registration_personal_photo_oversized_413(monkeypatch):
    from api import registration

    async def _run():
        big = _upload(JPEG_BYTES + b"\x00" * uv.MAX_REGISTRATION_IMAGE_BYTES)
        with pytest.raises(HTTPException) as exc:
            await registration.upload_personal_photo(file=big, driver_id="d1")
        assert exc.value.status_code == 413

    asyncio.run(_run())


def test_registration_personal_photo_wrong_magic_415(monkeypatch):
    from api import registration

    async def _run():
        with pytest.raises(HTTPException) as exc:
            await registration.upload_personal_photo(file=_upload(PDF_BYTES), driver_id="d1")
        assert exc.value.status_code == 415

    asyncio.run(_run())


def test_registration_personal_photo_jpeg_passes_with_real_mime(monkeypatch):
    from api import registration

    saved = {}
    monkeypatch.setattr(
        registration.storage,
        "save_file",
        lambda data, category, *, ext, content_type: saved.update(
            data=data, category=category, ext=ext, content_type=content_type
        ) or "photos/k1",
    )
    monkeypatch.setattr(registration.reg_dal, "update_driver", lambda _id, _upd: None)

    async def _run():
        return await registration.upload_personal_photo(file=_upload(JPEG_BYTES), driver_id="d1")

    result = asyncio.run(_run())
    assert result == {"personal_photo_key": "photos/k1"}
    assert saved["ext"] == "jpg"
    assert saved["content_type"] == "image/jpeg"
    assert saved["data"] == JPEG_BYTES


def test_registration_png_stored_as_png_not_relabeled_jpeg(monkeypatch):
    from api import registration

    saved = {}
    monkeypatch.setattr(
        registration.storage,
        "save_file",
        lambda data, category, *, ext, content_type: saved.update(ext=ext, content_type=content_type) or "k",
    )
    monkeypatch.setattr(registration.reg_dal, "update_driver", lambda _id, _upd: None)

    async def _run():
        return await registration.upload_cabin_photo(file=_upload(PNG_BYTES), driver_id="d1")

    asyncio.run(_run())
    assert saved == {"ext": "png", "content_type": "image/png"}


def test_registration_vehicle_photo_validated(monkeypatch):
    from api import registration

    async def _run():
        with pytest.raises(HTTPException) as exc:
            await registration.upload_vehicle_photo(file=_upload(b"MZ\x90\x00"), driver_id="d1")
        assert exc.value.status_code == 415

    asyncio.run(_run())


def test_registration_vehicle_optional_photo_oversized_413(monkeypatch):
    from api import registration

    async def _run():
        big = _upload(JPEG_BYTES + b"\x00" * uv.MAX_REGISTRATION_IMAGE_BYTES)
        with pytest.raises(HTTPException) as exc:
            await registration.save_vehicle(
                vehicle_type="tent",
                capacity_kg=1000,
                plate="",
                brand="",
                year=0,
                photo=big,
                driver_id="d1",
            )
        assert exc.value.status_code == 413

    asyncio.run(_run())


# ── Chat photo / voice ─────────────────────────────────────────────────────
def test_chat_photo_wrong_magic_415(monkeypatch):
    from api import chat

    async def _run():
        with pytest.raises(HTTPException) as exc:
            await chat.upload_chat_photo(file=_upload(PDF_BYTES, "photo.jpg"), user={"id": "u1"})
        assert exc.value.status_code == 415

    asyncio.run(_run())


def test_chat_voice_magic_bytes_override_filename(monkeypatch):
    from api import chat

    saved = {}
    monkeypatch.setattr(
        chat.storage,
        "save_file",
        lambda data, category, *, ext, content_type: saved.update(ext=ext, content_type=content_type) or "voice-key",
    )

    async def _run():
        # Filename lies about the type — magic bytes must win.
        return await chat.upload_chat_voice(
            file=_upload(WEBM_BYTES, filename="voice.m4a", content_type="audio/mp4"),
            user={"id": "u1"},
        )

    result = asyncio.run(_run())
    assert result == {"voice_key": "voice-key"}
    assert saved == {"ext": "webm", "content_type": "audio/webm"}


def test_chat_voice_renamed_binary_415(monkeypatch):
    from api import chat

    async def _run():
        with pytest.raises(HTTPException) as exc:
            await chat.upload_chat_voice(
                file=_upload(PDF_BYTES, filename="note.webm", content_type="audio/webm"),
                user={"id": "u1"},
            )
        assert exc.value.status_code == 415

    asyncio.run(_run())


# ── Profile PRO-documents ──────────────────────────────────────────────────
def test_pro_document_declared_mime_spoof_rejected(monkeypatch):
    from api import profile

    async def _run():
        # Declared image/png, content is PDF → magic bytes must reject.
        with pytest.raises(HTTPException) as exc:
            await profile.upload_pro_document(
                kind="tir",
                file=_upload(PDF_BYTES, "tir.png", "image/png"),
                user={"id": "u1"},
            )
        assert exc.value.status_code == 415

    asyncio.run(_run())


def test_pro_document_webp_passes_with_sniffed_mime(monkeypatch):
    from api import profile
    from services import storage_service

    saved = {}
    monkeypatch.setattr(
        storage_service,
        "save_file",
        lambda data, category, *, ext, content_type: saved.update(ext=ext, content_type=content_type) or "pro-key",
    )
    monkeypatch.setattr(profile.reg_dal, "update_driver", lambda _id, _upd: None)
    monkeypatch.setattr(profile.file_signing, "sign", lambda ref, ttl=None: ref)

    async def _run():
        return await profile.upload_pro_document(
            kind="cmr",
            file=_upload(WEBP_BYTES, "cmr.webp", "image/webp"),
            user={"id": "u1"},
        )

    result = asyncio.run(_run())
    assert result["ok"] is True
    assert saved == {"ext": "webp", "content_type": "image/webp"}


# ── Deal-room delegation ───────────────────────────────────────────────────
def test_deal_room_uses_shared_validator():
    from api import deal_room

    assert deal_room._sniff_mime is uv.sniff_mime
    assert deal_room._safe_original_name is uv.sanitize_original_name
    assert deal_room._MAX_ATTACH_BYTES == uv.MAX_ATTACH_BYTES
    assert deal_room._sniff_mime(JPEG_BYTES) == "image/jpeg"
