"""Release-hardening QA (2026-09-13): item 2 — file/storage security.

Exercises the REAL `GET /storage/{path}` route function registered in
main.py (services/storage_service.py and services/file_signing.py already
have unit coverage in test_storage_path_security.py / test_production_security_
guards.py — this file drives the actual HTTP-facing route function those
services sit behind, with attacker-shaped inputs) end to end:

  - absolute/relative path traversal in the URL path segment
  - missing / malformed / expired / tampered HMAC signature
  - a signature minted for one key reused against a different key
  - the happy path (valid signature -> 200, real bytes)

`main.serve_signed_storage` is a plain module-level function (defined inside
an `if storage_service.PROVIDER == "local":` block at import time, then
decorated with @app.get) — calling it directly, like the existing IDOR tests
call marketplace/chat endpoint functions directly, exercises the exact
production code path without needing a running ASGI server or worrying about
an HTTP client's own URL dot-segment normalization masking what we're testing.
"""
from pathlib import Path

import pytest
from fastapi import HTTPException

from main import serve_signed_storage
from services import storage_service, file_signing


@pytest.fixture()
def _isolated_root(tmp_path, monkeypatch):
    monkeypatch.setattr(storage_service, "LOCAL_ROOT", tmp_path)
    monkeypatch.setattr(storage_service, "LOCAL_PUBLIC_BASE", "/security/storage")
    secret_dir = tmp_path / "licenses"
    secret_dir.mkdir()
    (secret_dir / "real.jpg").write_bytes(b"owner-only-bytes")
    (tmp_path.parent / "outside-secret.txt").write_text("should never be servable")
    return tmp_path


def _sig_for(key: str, ttl: int = 3600):
    signed = file_signing.sign(f"{storage_service.LOCAL_PUBLIC_BASE}/{key}", ttl=ttl)
    # sign() returns "<base>/<key>?exp=..&sig=.." — parse it back out.
    qs = signed.split("?", 1)[1]
    params = dict(p.split("=", 1) for p in qs.split("&"))
    return params["exp"], params["sig"]


def test_01_dotdot_path_traversal_rejected_before_signature_check(_isolated_root):
    """../ escaping LOCAL_ROOT is rejected even with NO exp/sig at all —
    proves the traversal guard runs before (and independent of) auth."""
    with pytest.raises(HTTPException) as exc:
        serve_signed_storage("../outside-secret.txt")
    assert exc.value.status_code == 403


def test_02_nested_dotdot_traversal_rejected(_isolated_root):
    with pytest.raises(HTTPException) as exc:
        serve_signed_storage("licenses/../../outside-secret.txt")
    assert exc.value.status_code == 403


def test_03_absolute_path_style_segment_rejected(_isolated_root):
    """A path segment shaped like an absolute filesystem path (e.g. from a
    client sending '/etc/passwd' as the captured {path:path}) must resolve
    relative to LOCAL_ROOT, never escape it."""
    with pytest.raises(HTTPException) as exc:
        serve_signed_storage("../../../../../../etc/passwd")
    assert exc.value.status_code == 403


def test_04_missing_signature_rejected(_isolated_root):
    with pytest.raises(HTTPException) as exc:
        serve_signed_storage("licenses/real.jpg")
    assert exc.value.status_code == 403
    assert "signature" in str(exc.value.detail).lower()


def test_05_malformed_signature_rejected(_isolated_root):
    exp, _sig = _sig_for("licenses/real.jpg")
    with pytest.raises(HTTPException) as exc:
        serve_signed_storage("licenses/real.jpg", exp=exp, sig="0" * 64)
    assert exc.value.status_code == 403


def test_06_expired_signature_rejected(_isolated_root):
    import time

    exp, sig = _sig_for("licenses/real.jpg", ttl=60)
    # Force it into the past regardless of the TTL-bucket rounding in sign().
    past_exp = str(int(time.time()) - 10)
    with pytest.raises(HTTPException) as exc:
        serve_signed_storage("licenses/real.jpg", exp=past_exp, sig=sig)
    assert exc.value.status_code == 403


def test_07_signature_for_one_key_rejected_on_another_key(_isolated_root):
    """HMAC binds key|exp together — a signature minted for one object must
    not authorize reading a DIFFERENT object even with the same exp."""
    (storage_service.LOCAL_ROOT / "licenses" / "other.jpg").write_bytes(b"different owner bytes")
    exp, sig = _sig_for("licenses/real.jpg")
    with pytest.raises(HTTPException) as exc:
        serve_signed_storage("licenses/other.jpg", exp=exp, sig=sig)
    assert exc.value.status_code == 403


def test_08_missing_file_is_404_after_valid_signature(_isolated_root):
    exp, sig = _sig_for("licenses/does-not-exist.jpg")
    with pytest.raises(HTTPException) as exc:
        serve_signed_storage("licenses/does-not-exist.jpg", exp=exp, sig=sig)
    assert exc.value.status_code == 404


def test_09_valid_signature_serves_the_real_file(_isolated_root):
    exp, sig = _sig_for("licenses/real.jpg")
    resp = serve_signed_storage("licenses/real.jpg", exp=exp, sig=sig)
    assert Path(resp.path).read_bytes() == b"owner-only-bytes"


def test_10_file_signing_refuses_to_operate_without_a_dedicated_key(monkeypatch):
    """Fail-closed contract: with no (or too-short) FILE_SIGNING_KEY, sign()
    must not silently hand back an unsigned/guessable link and verify() must
    reject everything — see services/file_signing.py's module docstring."""
    monkeypatch.delenv("FILE_SIGNING_KEY", raising=False)
    assert file_signing.is_configured() is False
    with pytest.raises(file_signing.FileSigningConfigurationError):
        file_signing.sign("/security/storage/licenses/real.jpg")
    assert file_signing.verify("licenses/real.jpg", 4102444800, "anything") is False
