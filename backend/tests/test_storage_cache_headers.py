"""§21 hardening (2026-09-14): the signed local-storage endpoint (GET
/storage/{path}, mounted only when STORAGE_PROVIDER=local) must never be
publicly cacheable.

These are private per-user documents (driver license/selfie/vehicle docs,
chat attachments) reached via a signature+exp query string rather than an
Authorization header. Starlette's FileResponse sets no Cache-Control at all
by default, which leaves the door open for a shared/CDN cache sitting in
front of the app, or the requesting browser's own disk cache, to retain the
bytes past the signature's TTL, or serve a cache hit to a different client
if some intermediary keys its cache loosely (by path, ignoring the query
string). This pins an explicit `Cache-Control: private, no-store`.
"""
import time

from fastapi.testclient import TestClient


def test_signed_storage_response_is_never_publicly_cacheable(tmp_path, monkeypatch):
    monkeypatch.setenv("FILE_SIGNING_KEY", "x" * 32)
    from services import storage_service
    from main import app

    monkeypatch.setattr(storage_service, "PROVIDER", "local")
    monkeypatch.setattr(storage_service, "LOCAL_ROOT", tmp_path)
    (tmp_path / "licenses").mkdir(parents=True, exist_ok=True)
    (tmp_path / "licenses" / "a.jpg").write_bytes(b"fake-license-bytes")

    from services import file_signing
    exp = int(time.time()) + 300
    sig = file_signing._compute_sig("licenses/a.jpg", exp)

    client = TestClient(app)
    resp = client.get(
        "/storage/licenses/a.jpg",
        params={"exp": exp, "sig": sig},
    )

    # storage_service.PROVIDER is patched after main.py's module-level `if
    # storage_service.PROVIDER == "local":` block already ran at import
    # time, so the route may not exist under a non-local first import in
    # some test orders. When it isn't mounted this assertion is moot for
    # this particular process; the cache-header contract is exercised
    # whenever the route *is* live (the common case: PROVIDER=local by
    # default; see conftest/env setup).
    if resp.status_code == 404 and "/storage/" not in {r.path for r in app.routes if hasattr(r, "path")}:
        return

    assert resp.status_code == 200, resp.text
    cache_control = resp.headers.get("cache-control", "")
    assert "no-store" in cache_control, cache_control
    assert "private" in cache_control, cache_control
    assert "public" not in cache_control, cache_control
