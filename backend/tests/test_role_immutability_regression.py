"""Regression lock for the 3 P0 role-flip fixes found during the Full
Product Audit (2026-09-13, branch claude/full-product-audit-20260913):

  1. PATCH /api/v1/users/me                         (api/profile.py, b9ea7527)
  2. POST /driver/registration/complete-basic        (api/driver_registration.py, 3dcaf1b6)
  3. POST /driver/registration/submit                (api/driver_registration.py, 3dcaf1b6)

Root cause (all three): a driver/client account, once its role was already
set, could still flip it to the other role through one of these three
independent server-side endpoints — no re-verification, no re-onboarding,
a single authenticated call. Each fix rejects with 409 {"error":
"ROLE_ALREADY_SET"} when the account's current role is already
driver/client and the request would change it.

These fixes were originally verified live against an isolated test backend
(see the two commits' own messages) but shipped with no automated pytest
coverage — this file closes that gap so a future refactor cannot silently
reopen any of the three vectors. Each endpoint gets: (a) the negative case
(already-set role, attempted flip -> 409 ROLE_ALREADY_SET, no write), (b)
a positive case proving first-time assignment / idempotent same-role calls
are unaffected (legitimate flows must keep working).
"""
import pytest
from fastapi import HTTPException

from api import profile, driver_registration
from blacklist import manager as blacklist_mgr


@pytest.fixture(autouse=True)
def isolate_profile_side_effects(monkeypatch):
    monkeypatch.setattr(profile, "_ensure_columns", lambda: None)


# ── 1. PATCH /api/v1/users/me (api/profile.py) ────────────────────────────

def _run_update_profile(monkeypatch, body, current_role):
    current_row = {
        "id": "user-1", "phone": "+77011234567", "full_name": "Existing User",
        "company_name": "Existing Co", "role": current_role,
    }
    captured = {}
    monkeypatch.setattr(profile.reg_dal, "get_driver", lambda _uid: current_row)
    monkeypatch.setattr(profile.reg_dal, "update_driver", lambda uid, values: captured.update({"uid": uid, "values": dict(values)}))
    return profile.update_profile(body, user={"id": "user-1"}), captured


def test_patch_users_me_rejects_flip_from_driver_to_client(monkeypatch):
    with pytest.raises(HTTPException) as exc:
        _run_update_profile(
            monkeypatch,
            profile.UpdateProfileIn(role="client", name="Existing User", phone="+77011234567", company_name="Evil Co"),
            current_role="driver",
        )
    assert exc.value.status_code == 409
    assert exc.value.detail["error"] == "ROLE_ALREADY_SET"


def test_patch_users_me_rejects_flip_from_client_to_driver(monkeypatch):
    with pytest.raises(HTTPException) as exc:
        _run_update_profile(
            monkeypatch,
            profile.UpdateProfileIn(role="driver", name="Existing User", phone="+77011234567"),
            current_role="client",
        )
    assert exc.value.status_code == 409
    assert exc.value.detail["error"] == "ROLE_ALREADY_SET"


def test_patch_users_me_allows_idempotent_same_role_update(monkeypatch):
    result, captured = _run_update_profile(
        monkeypatch,
        profile.UpdateProfileIn(role="driver", name="Existing User", phone="+77011234567"),
        current_role="driver",
    )
    assert result == {"ok": True}
    assert captured["values"]["role"] == "driver"


@pytest.mark.parametrize("first_role", [None, "guest"])
def test_patch_users_me_allows_first_time_role_assignment(monkeypatch, first_role):
    result, captured = _run_update_profile(
        monkeypatch,
        profile.UpdateProfileIn(role="client", name="New User", phone="+77011234567", company_name="New Co"),
        current_role=first_role,
    )
    assert result == {"ok": True}
    assert captured["values"]["role"] == "client"


# ── 2. POST /driver/registration/complete-basic (api/driver_registration.py) ──

def _basic_driver(**overrides):
    driver = {
        "id": "basic-driver", "role": "driver", "status": "pending", "verification_level": 1,
        "citizenship_country": "KZ", "full_name": "Basic Driver", "birth_date": "01.01.1985",
        "iin": "850101123456", "vehicle_registration_country": "KZ",
        "truck_kind": "tractor_semitrailer", "body_type": "curtain_sider",
        "vehicle_brand": "Volvo", "vehicle_plate": "123ABC02", "capacity_tons": 20, "volume_m3": 86,
    }
    driver.update(overrides)
    return driver


def test_complete_basic_rejects_role_flip_from_client(monkeypatch):
    updates = {}
    monkeypatch.setattr(driver_registration.reg_dal, "get_driver", lambda _: _basic_driver(role="client"))
    monkeypatch.setattr(driver_registration.reg_dal, "update_driver", lambda _, fields: updates.update(fields))

    with pytest.raises(HTTPException) as exc:
        driver_registration.complete_basic_onboarding("basic-driver")

    assert exc.value.status_code == 409
    assert exc.value.detail["error"] == "ROLE_ALREADY_SET"
    # The bypass this closes was reachable with an EMPTY/incomplete profile too
    # (a client account never needs valid driver fields to hit this endpoint) —
    # confirm the role check fires before, not after, field-completeness is
    # evaluated, and that no write happens either way.
    assert updates == {}


def test_complete_basic_rejects_role_flip_from_client_even_with_empty_profile(monkeypatch):
    """The exact live-exploit shape from the audit: a client account with NO
    driver fields filled in at all, calling this endpoint directly."""
    updates = {}
    monkeypatch.setattr(driver_registration.reg_dal, "get_driver", lambda _: {"id": "basic-driver", "role": "client"})
    monkeypatch.setattr(driver_registration.reg_dal, "update_driver", lambda _, fields: updates.update(fields))

    with pytest.raises(HTTPException) as exc:
        driver_registration.complete_basic_onboarding("basic-driver")

    assert exc.value.status_code == 409
    assert exc.value.detail["error"] == "ROLE_ALREADY_SET"
    assert updates == {}


def test_complete_basic_still_allows_legitimate_driver_onboarding(monkeypatch):
    """Regression guard the other direction: the fix must not have broken the
    ordinary, already-covered driver-onboarding flow."""
    updates = {}
    monkeypatch.setattr(driver_registration.reg_dal, "get_driver", lambda _: _basic_driver())
    monkeypatch.setattr(driver_registration.reg_dal, "update_driver", lambda _, fields: updates.update(fields))

    result = driver_registration.complete_basic_onboarding("basic-driver")

    assert result["status"] == "basic"
    assert updates["role"] == "driver"


# ── 3. POST /driver/registration/submit (api/driver_registration.py) ──────

def test_submit_rejects_role_flip_from_client_on_empty_profile(monkeypatch):
    """The most direct live-exploit shape from the audit: a client account
    hits /submit with NO prior /draft or /complete-basic call at all."""
    monkeypatch.setattr(driver_registration.reg_dal, "get_driver", lambda _: {"id": "client-driver", "role": "client"})
    update_called = []
    monkeypatch.setattr(driver_registration.reg_dal, "update_driver", lambda *a, **k: update_called.append((a, k)))
    blacklist_called = []
    monkeypatch.setattr(blacklist_mgr, "check_blacklist", lambda **kw: (blacklist_called.append(kw), [])[1])

    with pytest.raises(HTTPException) as exc:
        driver_registration.submit_registration("client-driver")

    assert exc.value.status_code == 409
    assert exc.value.detail["error"] == "ROLE_ALREADY_SET"
    # Fails closed BEFORE any scoring/blacklist/write side effect runs.
    assert update_called == []
    assert blacklist_called == []


def test_submit_still_allows_legitimate_driver_submission(monkeypatch):
    updates = {}
    monkeypatch.setattr(driver_registration.reg_dal, "get_driver", lambda _: {
        "id": "track4-driver", "role": "driver", "phone": "+77000000000",
        "full_name": "QA Driver", "vehicle_plate": "KZ123", "verification_level": 0, "status": "pending",
    })
    monkeypatch.setattr(driver_registration.reg_dal, "update_driver", lambda _, fields: updates.update(fields))
    monkeypatch.setattr(blacklist_mgr, "check_blacklist", lambda **_: [])

    result = driver_registration.submit_registration("track4-driver")

    assert result["status"] == "pending"
    assert updates["role"] == "driver"
