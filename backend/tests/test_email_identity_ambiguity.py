"""Security regression: a canonical login email that matches MORE THAN ONE
account must fail closed — no UrTruck session/token issued for any of them.

Owner review round 3 (25.08.2026), PR #298: _migrate_email_identity()
deliberately skips its UNIQUE(email) index when historical duplicate
canonical emails already exist (never blocks production startup). Before
this fix, get_or_create_driver_by_email() used `SELECT ... LIMIT 1`, so a
verified Google/Apple/Email identity could silently resolve to an
ARBITRARY one of several accounts sharing that canonical email — handing a
session for someone else's account to whoever controls the colliding
email. This test proves the fail-closed fix: duplicate canonical email =>
AmbiguousEmailIdentityError at the DAL layer, and HTTP 409 with no token
at both the social-auth and email-OTP verify endpoints.

Run from backend/:
    DB_PATH=/tmp/urtruck_test_email_ambiguity.db python -m pytest tests/test_email_identity_ambiguity.py
"""
import os
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_email_ambiguity.db")
Path(TEST_DB).unlink(missing_ok=True)

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from database import db as ddb
from database import registration_dal as reg_dal
from database import consent_dal
from api import social_auth, registration


ddb.init_db()
reg_dal.init_registration_schema()
consent_dal.init_consent_schema()

app = FastAPI()
app.include_router(social_auth.social_auth_router, prefix="/api/v1/register/social")
app.include_router(registration.reg_router, prefix="/api/v1/register")
client = TestClient(app)


def _drop_email_unique_index():
    """On a fresh test DB, _migrate_email_identity() ran at ddb.init_db()
    time with NO duplicates present yet, so it created uq_reg_email_ci —
    the opposite of the production scenario under test (where the index is
    deliberately SKIPPED because duplicates already existed at migration
    time). Drop it so this test's raw duplicate inserts reproduce the same
    unindexed, unenforced state real historical data would be in."""
    from database.db import get_conn
    with get_conn() as c:
        c.execute("DROP INDEX IF EXISTS uq_reg_email_ci")


def _insert_raw_driver(email=None, phone=None, full_name="Dup"):
    """Insert a drivers_registration row directly, bypassing every DAL
    identity-resolution path — simulates a HISTORICAL duplicate that
    already exists in production data (exactly what _migrate_email_identity
    detects and refuses to index)."""
    from database.db import get_conn, new_id
    did = new_id()
    with get_conn() as c:
        c.execute(
            "INSERT INTO drivers_registration "
            "(id, phone, email, full_name, whatsapp_verified, verification_level, current_step) "
            "VALUES (?, ?, ?, ?, 0, 1, 2)",
            (did, phone or f"auth_{did[:12]}", email, full_name),
        )
    return did


class FakeResponse:
    def __init__(self, status_code, payload=None):
        self.status_code = status_code
        self._payload = payload or {}

    def json(self):
        return self._payload


def social_user(email, provider="google", name="Owner"):
    return {
        "id": "supabase-user-dup",
        "aud": "authenticated",
        "email": email,
        "app_metadata": {"provider": provider, "providers": [provider]},
        "user_metadata": {"full_name": name},
    }


def test_dal_raises_on_duplicate_canonical_email():
    _drop_email_unique_index()
    email = "collision.dal@example.com"
    id_a = _insert_raw_driver(email=email, full_name="Account A")
    id_b = _insert_raw_driver(email=email, full_name="Account B")

    with pytest.raises(reg_dal.AmbiguousEmailIdentityError) as exc_info:
        reg_dal.get_or_create_driver_by_email(email)
    assert exc_info.value.count == 2
    # Fail closed means: no row was returned, no session-issuable identity.
    assert id_a != id_b  # sanity: they really are two distinct accounts


def test_dal_counts_email_column_and_legacy_phone_collision_together():
    # One account uses the new `email` column, another is a pre-migration
    # legacy row that still stores the email inside `phone`. Both resolve
    # to the SAME canonical email and must be counted as one collision,
    # not silently missed because they live in different columns.
    _drop_email_unique_index()
    email = "collision.legacy@example.com"
    id_a = _insert_raw_driver(email=email, full_name="Modern row")
    id_b = _insert_raw_driver(email=None, phone=email, full_name="Legacy row")

    with pytest.raises(reg_dal.AmbiguousEmailIdentityError) as exc_info:
        reg_dal.get_or_create_driver_by_email(email)
    assert exc_info.value.count == 2
    assert id_a != id_b


def test_dal_single_match_still_works_normally():
    # Regression guard: the fix must not false-positive on the normal,
    # non-colliding case.
    email = "unique.owner@example.com"
    driver = reg_dal.get_or_create_driver_by_email(email)
    assert driver["email"] == email
    again = reg_dal.get_or_create_driver_by_email(email)
    assert again["id"] == driver["id"]


def test_social_verify_returns_409_and_no_token_on_duplicate_email(monkeypatch):
    _drop_email_unique_index()
    email = "collision.social@example.com"
    _insert_raw_driver(email=email, full_name="Social Account A")
    _insert_raw_driver(email=email, full_name="Social Account B")

    monkeypatch.setattr(
        social_auth.httpx,
        "get",
        lambda *a, **k: FakeResponse(200, social_user(email)),
    )
    r = client.post(
        "/api/v1/register/social/verify",
        json={"access_token": "valid-social-access-token", "consent": True},
    )
    assert r.status_code == 409, r.text
    body = r.json()
    assert "token" not in body or not body.get("token")


def test_email_otp_verify_returns_409_and_no_token_on_duplicate_email(monkeypatch):
    _drop_email_unique_index()
    email = "collision.otp@example.com"
    _insert_raw_driver(email=email, full_name="OTP Account A")
    _insert_raw_driver(email=email, full_name="OTP Account B")

    # BETA_MODE bypass avoids needing a real OTP code for this DAL-focused
    # regression — the point under test is the identity-resolution branch
    # AFTER code verification succeeds, not the OTP mechanism itself.
    monkeypatch.setattr(registration, "BETA_MODE", True)
    r = client.post(
        "/api/v1/register/email/verify",
        json={"email": email, "code": registration.BETA_OTP_CODE},
    )
    assert r.status_code == 409, r.text
    body = r.json()
    assert "token" not in body or not body.get("token")


if __name__ == "__main__":
    import sys as _sys
    _sys.exit(pytest.main([__file__, "-q"]))
