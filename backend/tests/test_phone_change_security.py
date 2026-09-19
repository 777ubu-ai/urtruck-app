"""Authenticated phone-change security contract.

The generic profile PATCH may not mutate an already-bound phone. A new
number is changed only through the user-bound, single-use OTP challenge.
"""
import contextvars
import pytest
from datetime import datetime, timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api import rate_limit
from api.profile import profile_router
from database import registration_dal as reg_dal
from database.db import get_conn
from services import otp_service
from tests.auth_harness import override_require_level


app = FastAPI()
app.include_router(profile_router, prefix="/api/v1/users")
_current_user = contextvars.ContextVar("phone_change_user", default=None)


def _fake_require_level(_min):
    def dependency():
        user = _current_user.get()
        if not user:
            from fastapi import HTTPException
            raise HTTPException(status_code=401, detail="no user")
        return user
    return dependency


override_require_level(app, _fake_require_level(1))
client = TestClient(app)


def _new_user(suffix: str, phone: str):
    row = reg_dal.create_guest()
    uid = row["id"]
    reg_dal.update_driver(uid, {"phone": phone, "role": "client", "full_name": suffix})
    token = reg_dal.create_session(uid)
    _current_user.set({"id": uid, "verification_level": 1})
    return uid, token


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _reset_limits():
    rate_limit._store.clear()


def test_generic_patch_rejects_direct_phone_change():
    _reset_limits()
    _, token = _new_user("Patch blocked", "+77019998001")
    response = client.patch(
        "/api/v1/users/me",
        headers=_auth(token),
        json={"phone": "+77019998002"},
    )
    assert response.status_code == 400, response.text
    assert response.json()["detail"]["error"] == "PHONE_CHANGE_OTP_REQUIRED"


def test_request_confirm_rotates_sessions_and_audits_without_plaintext_otp(monkeypatch):
    _reset_limits()
    uid, old_token = _new_user("Successful change", "+77019998003")
    sent = {}

    def fake_send(phone, code, channel="whatsapp"):
        sent.update(phone=phone, code=code, channel=channel)
        return {"sent": True, "mock": True, "code": code}

    monkeypatch.setattr(otp_service, "send_otp", fake_send)
    requested = client.post(
        "/api/v1/users/me/phone-change/request",
        headers=_auth(old_token),
        json={"phone": "+7 (701) 999-80-04"},
    )
    assert requested.status_code == 200, requested.text
    assert requested.json()["phone_masked"] == "+770***004"
    assert requested.json()["challenge_id"]

    confirmed = client.post(
        "/api/v1/users/me/phone-change/confirm",
        headers=_auth(old_token),
        json={"phone": "+77019998004", "code": sent["code"]},
    )
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["token"]
    assert reg_dal.get_driver_by_token(old_token) is None
    assert reg_dal.get_driver(uid)["phone"] == "+77019998004"
    with get_conn() as c:
        challenge = c.execute(
            "SELECT code_digest, purpose, user_id, new_phone, consumed_at "
            "FROM phone_change_challenges WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
            (uid,),
        ).fetchone()
        audit = c.execute(
            "SELECT event_type, phone_masked FROM phone_change_audit WHERE user_id = ?",
            (uid,),
        ).fetchone()
    assert challenge["purpose"] == "phone_change"
    assert challenge["user_id"] == uid
    assert challenge["new_phone"] == "+77019998004"
    assert challenge["consumed_at"]
    assert challenge["code_digest"] != sent["code"]
    assert audit["event_type"] == "phone_changed"
    assert audit["phone_masked"] == "+770***004"


def test_wrong_expired_and_reused_otp_are_rejected(monkeypatch):
    _reset_limits()
    _, token = _new_user("OTP failures", "+77019998005")
    sent = {}

    def fake_send(phone, code, channel="whatsapp"):
        sent["code"] = code
        return {"sent": True, "mock": True}

    monkeypatch.setattr(otp_service, "send_otp", fake_send)
    new_phone = "+77019998006"
    assert client.post(
        "/api/v1/users/me/phone-change/request",
        headers=_auth(token), json={"phone": new_phone},
    ).status_code == 200
    wrong = client.post(
        "/api/v1/users/me/phone-change/confirm",
        headers=_auth(token), json={"phone": new_phone, "code": "0000" if sent["code"] != "0000" else "0001"},
    )
    assert wrong.status_code == 400
    assert wrong.json()["detail"]["error"] == "PHONE_CHANGE_OTP_INVALID"

    with get_conn() as c:
        c.execute(
            "UPDATE phone_change_challenges SET expires_at = ? WHERE user_id = ?",
            ((datetime.utcnow() - timedelta(minutes=1)).isoformat(), _current_user.get()["id"]),
        )
    expired = client.post(
        "/api/v1/users/me/phone-change/confirm",
        headers=_auth(token), json={"phone": new_phone, "code": sent["code"]},
    )
    assert expired.status_code == 400
    assert expired.json()["detail"]["error"] == "PHONE_CHANGE_OTP_EXPIRED"

    _reset_limits()
    sent.clear()
    new_phone_2 = "+77019998007"
    assert client.post(
        "/api/v1/users/me/phone-change/request",
        headers=_auth(token), json={"phone": new_phone_2},
    ).status_code == 200
    first = client.post(
        "/api/v1/users/me/phone-change/confirm",
        headers=_auth(token), json={"phone": new_phone_2, "code": sent["code"]},
    )
    assert first.status_code == 200, first.text
    replay = client.post(
        "/api/v1/users/me/phone-change/confirm",
        headers=_auth(token), json={"phone": new_phone_2, "code": sent["code"]},
    )
    assert replay.status_code == 400
    assert replay.json()["detail"]["error"] == "PHONE_CHANGE_OTP_NOT_FOUND"


def test_other_account_number_and_request_rate_limit(monkeypatch):
    _reset_limits()
    _, other_token = _new_user("Other owner", "+77019998008")
    _, token = _new_user("Rate limited", "+77019998009")
    monkeypatch.setattr(otp_service, "send_otp", lambda *args, **kwargs: {"sent": True, "mock": True})

    duplicate = client.post(
        "/api/v1/users/me/phone-change/request",
        headers=_auth(token), json={"phone": "+7 701 999 80 08"},
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"]["error"] == "PHONE_ALREADY_IN_USE"

    first = client.post(
        "/api/v1/users/me/phone-change/request",
        headers=_auth(token), json={"phone": "+77019998010"},
    )
    second = client.post(
        "/api/v1/users/me/phone-change/request",
        headers=_auth(token), json={"phone": "+77019998011"},
    )
    assert first.status_code == 200, first.text
    assert second.status_code == 429, second.text
    assert other_token


def test_role_cannot_change_while_restoring_phone_protection():
    _reset_limits()
    uid, token = _new_user("Immutable role", "+77019998021")
    response = client.patch("/api/v1/users/me", headers=_auth(token), json={"role": "driver"})
    assert response.status_code == 409
    assert response.json()["detail"]["error"] == "ROLE_ALREADY_SET"
    assert reg_dal.get_driver(uid)["role"] == "client"


def test_wrong_attempts_survive_rate_limiter_restart(monkeypatch):
    _reset_limits()
    uid, token = _new_user("Persistent attempts", "+77019998022")
    monkeypatch.setattr(otp_service, "generate_code", lambda: "1234")
    monkeypatch.setattr(otp_service, "send_otp", lambda *a, **kw: {"sent": True})
    phone = "+77019998023"
    assert client.post("/api/v1/users/me/phone-change/request", headers=_auth(token), json={"phone": phone}).status_code == 200
    for attempt in range(1, 6):
        _reset_limits()
        result = client.post("/api/v1/users/me/phone-change/confirm", headers=_auth(token), json={"phone": phone, "code": "5678"})
        assert result.status_code == (429 if attempt == 5 else 400)
        with get_conn() as c:
            assert c.execute("SELECT attempts FROM phone_change_challenges WHERE user_id=?", (uid,)).fetchone()[0] == attempt
    _reset_limits()
    result = client.post("/api/v1/users/me/phone-change/confirm", headers=_auth(token), json={"phone": phone, "code": "1234"})
    assert result.status_code == 429
    assert reg_dal.get_driver(uid)["phone"] == "+77019998022"


def test_session_rotation_failure_rolls_back_phone_and_challenge(monkeypatch):
    _reset_limits()
    uid, token = _new_user("Atomic rotation", "+77019998024")
    monkeypatch.setattr(otp_service, "generate_code", lambda: "1234")
    monkeypatch.setattr(otp_service, "send_otp", lambda *a, **kw: {"sent": True})
    phone = "+77019998025"
    assert client.post("/api/v1/users/me/phone-change/request", headers=_auth(token), json={"phone": phone}).status_code == 200

    def broken_rotation(driver_id, *, connection):
        connection.execute("DELETE FROM reg_sessions WHERE driver_id=?", (driver_id,))
        raise RuntimeError("rotation interrupted")

    monkeypatch.setattr(reg_dal, "rotate_sessions_for_driver", broken_rotation)
    with pytest.raises(RuntimeError, match="rotation interrupted"):
        client.post("/api/v1/users/me/phone-change/confirm", headers=_auth(token), json={"phone": phone, "code": "1234"})
    assert reg_dal.get_driver(uid)["phone"] == "+77019998024"
    assert reg_dal.get_driver_by_token(token) == uid
    with get_conn() as c:
        assert c.execute("SELECT consumed_at FROM phone_change_challenges WHERE user_id=?", (uid,)).fetchone()[0] is None
        assert c.execute("SELECT COUNT(*) FROM phone_change_audit WHERE user_id=?", (uid,)).fetchone()[0] == 0


def test_concurrent_confirm_consumes_one_challenge(monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from starlette.requests import Request
    from fastapi import HTTPException
    from api.profile import confirm_phone_change, PhoneChangeConfirmIn
    _reset_limits()
    uid, token = _new_user("Concurrent confirmation", "+77019998026")
    monkeypatch.setattr(otp_service, "generate_code", lambda: "1234")
    monkeypatch.setattr(otp_service, "send_otp", lambda *a, **kw: {"sent": True})
    phone = "+77019998027"
    assert client.post("/api/v1/users/me/phone-change/request", headers=_auth(token), json={"phone": phone}).status_code == 200
    barrier = Barrier(2)

    def confirm(_):
        barrier.wait()
        try:
            confirm_phone_change(PhoneChangeConfirmIn(phone=phone, code="1234"), Request({"type": "http", "headers": []}), user={"id": uid})
            return "ok"
        except HTTPException as exc:
            return exc.detail["error"]

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(confirm, range(2)))
    assert sorted(results) == ["PHONE_CHANGE_OTP_NOT_FOUND", "ok"]
    with get_conn() as c:
        assert c.execute("SELECT COUNT(*) FROM phone_change_audit WHERE user_id=?", (uid,)).fetchone()[0] == 1
        assert c.execute("SELECT COUNT(*) FROM reg_sessions WHERE driver_id=?", (uid,)).fetchone()[0] == 1
