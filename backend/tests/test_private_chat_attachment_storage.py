"""Private VPS attachment transport, opt-in and backward-compatible refs."""
import ast
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit, parse_qs

os.environ.setdefault("ENV", "test")
os.environ.setdefault("STORAGE_PROVIDER", "local")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.testclient import TestClient
from services import storage_service as storage, file_signing

@pytest.fixture
def configured(monkeypatch, tmp_path):
    monkeypatch.setattr(storage, "_PROD", False)
    monkeypatch.setattr(storage, "PRIVATE_CHAT_ROOT", str(tmp_path / "private"))
    monkeypatch.setattr(storage, "PRIVATE_CHAT_WRITE", True)
    monkeypatch.setattr(storage, "LOCAL_ROOT", tmp_path / "old-local")
    monkeypatch.setattr(storage, "LOCAL_PUBLIC_BASE", "/security/storage")
    monkeypatch.setattr(storage, "PROVIDER", "supabase")
    monkeypatch.setenv("FILE_SIGNING_KEY", "s" * 64)
    return tmp_path

def test_opt_in_private_attachment_write_and_original_bytes(configured):
    payload = b"%PDF-1.7\n" + b"x" * (60 * 1024 * 1024)
    ref = storage.save_file(payload, "chat_attachments", ext="pdf", content_type="application/pdf")
    path = Path(storage.get_local_path(ref))
    assert path.read_bytes() == payload
    assert path.is_relative_to(Path(storage.PRIVATE_CHAT_ROOT))
    assert path.stat().st_mode & 0o777 == 0o600
    assert not list(path.parent.glob(".upload-*"))

def test_other_categories_keep_supabase_and_old_refs(configured, monkeypatch):
    monkeypatch.setattr(storage, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(storage, "SUPABASE_KEY", "test-service")
    seen = []
    monkeypatch.setattr(storage, "_save_supabase", lambda data, key, mime: seen.append(key) or "supabase://urtruck-docs/old.jpg")
    assert storage.save_file(b"photo", "chat_photos").startswith("supabase://")
    assert seen[0].startswith("chat_photos/")
    assert storage.is_private_remote_ref("supabase://urtruck-docs/existing.pdf")

def test_disabled_write_keeps_existing_private_file_readable(configured, monkeypatch):
    ref = storage.save_file(b"%PDF-1.7\n", "chat_attachments", ext="pdf")
    monkeypatch.setattr(storage, "PRIVATE_CHAT_WRITE", False)
    assert Path(storage.get_local_path(ref)).read_bytes().startswith(b"%PDF-")

def test_production_wrong_root_or_missing_signing_key_fail_closed(configured, monkeypatch):
    monkeypatch.setattr(storage, "_PROD", True)
    with pytest.raises(storage.StorageSaveError):
        storage.save_file(b"pdf", "chat_attachments")
    monkeypatch.setattr(storage, "_PROD", False)
    monkeypatch.delenv("FILE_SIGNING_KEY")
    with pytest.raises(storage.StorageSaveError):
        storage.save_file(b"pdf", "chat_attachments")

def test_disk_reserve_rejects_write(configured, monkeypatch):
    from collections import namedtuple
    usage = namedtuple("usage", "total used free")
    monkeypatch.setattr(storage.shutil, "disk_usage", lambda _: usage(100, 100, 0))
    with pytest.raises(storage.StorageSaveError):
        storage.save_file(b"pdf", "chat_attachments")
    assert not list(Path(storage.PRIVATE_CHAT_ROOT).rglob("*.bin"))

def storage_client():
    # Execute the actual handler AST without importing main/startup or starting
    # schedulers/DB migrations. This still exercises actual HTTP FileResponse.
    source = ast.parse((Path(__file__).resolve().parents[1] / "main.py").read_text())
    handler = next(node for node in ast.walk(source) if isinstance(node, ast.FunctionDef) and node.name == "serve_signed_storage")
    handler.decorator_list = []
    from typing import Optional
    scope = {"storage_service": storage, "HTTPException": HTTPException, "FileResponse": FileResponse, "Optional": Optional}
    exec(compile(ast.fix_missing_locations(ast.Module(body=[handler], type_ignores=[])), "main.py", "exec"), scope)
    app = FastAPI()
    app.get("/security/storage/{path:path}")(scope["serve_signed_storage"])
    return TestClient(app)

def test_download_requires_signature_expiry_and_preserves_bytes(configured):
    payload = b"%PDF-1.7\nprivate"
    ref = storage.save_file(payload, "chat_attachments", ext="pdf")
    client = storage_client()
    assert client.get(ref).status_code == 403
    signed = file_signing.sign(ref, ttl=60)
    response = client.get(signed)
    assert response.status_code == 200 and response.content == payload
    assert response.headers["cache-control"] == "private, no-store"
    query = parse_qs(urlsplit(signed).query)
    assert client.get(ref, params={"exp": "1", "sig": query["sig"][0]}).status_code == 403
    assert client.get(ref, params={"exp": query["exp"][0], "sig": "tampered"}).status_code == 403

def test_private_path_traversal_is_rejected(configured):
    with pytest.raises(ValueError):
        storage.storage_root_for_key("chat_attachments/../../outside.pdf")
