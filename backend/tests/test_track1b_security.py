"""Track 1B behavioral security gates (no source-shape assertions)."""
import pytest
from fastapi import HTTPException


def _driver(**overrides):
    d = {
        "id": "d-track1b", "phone": "+77000000000", "full_name": "QA",
        "whatsapp_verified": 1, "face_quality": 1.0, "iin": "870101350123",
        "license_verified": 1, "passport_verified": 1, "vehicle_type": "truck",
        "face_verified": 1, "license_ocr": '{"experience_years": 10}',
        "passport_ocr": '{"year": 2020, "plate_number": "123"}',
        "manual_review_required": 0, "verification_level": 2,
        "verification_provider_status": "untrusted", "status": "pending",
    }
    d.update(overrides)
    return d


def test_p1_1_self_service_moderate_untrusted_provider_stays_manual(monkeypatch):
    from api import registration
    updates = {}
    monkeypatch.setattr(registration.reg_dal, "get_driver", lambda _: _driver())
    monkeypatch.setattr(registration.reg_dal, "update_driver", lambda _, values: updates.update(values))
    monkeypatch.setattr(registration, "calculate_score", lambda *_: {"total_score": 90, "color_code": "green"})
    monkeypatch.setattr("database.db.blacklist_check", lambda **_: None)
    result = registration.run_moderation("d-track1b")
    assert result["status"] == "manual_review"
    assert result["auto_approved"] is False
    assert updates["status"] == "manual_review"
    assert updates["manual_review_required"] == 1
    assert updates.get("verification_level") is None


def test_p1_1_only_trusted_real_capability_can_self_approve(monkeypatch):
    from api import registration
    updates = {}
    monkeypatch.setattr(registration.reg_dal, "get_driver", lambda _: _driver(verification_provider_status="trusted_real"))
    monkeypatch.setattr(registration.reg_dal, "update_driver", lambda _, values: updates.update(values))
    monkeypatch.setattr(registration, "calculate_score", lambda *_: {"total_score": 90, "color_code": "green"})
    monkeypatch.setattr("database.db.blacklist_check", lambda **_: None)
    result = registration.run_moderation("d-track1b")
    assert result["status"] == "approved"
    assert result["auto_approved"] is True
    assert updates["verification_level"] == 3
    assert updates["status"] == "approved"
    assert not updates.get("manual_review_required", 0)


def test_p1_1_maximum_score_still_cannot_approve_untrusted(monkeypatch):
    from api import registration
    updates = {}
    monkeypatch.setattr(registration.reg_dal, "get_driver", lambda _: _driver(verification_provider_status="mock"))
    monkeypatch.setattr(registration.reg_dal, "update_driver", lambda _, values: updates.update(values))
    monkeypatch.setattr(registration, "calculate_score", lambda *_: {"total_score": 100, "color_code": "green"})
    monkeypatch.setattr("database.db.blacklist_check", lambda **_: None)
    response = registration.run_moderation("d-track1b")
    assert response["status"] == updates["status"] == "manual_review"
    assert response["manual_review_required"] is True


@pytest.mark.parametrize("provider_status", ["unavailable", "error", "heuristic", "mock"])
def test_p1_1_ocr_or_non_real_provider_never_grants_level3(monkeypatch, provider_status):
    from api import registration
    updates = {}
    monkeypatch.setattr(registration.reg_dal, "get_driver", lambda _: _driver(verification_provider_status=provider_status))
    monkeypatch.setattr(registration.reg_dal, "update_driver", lambda _, values: updates.update(values))
    monkeypatch.setattr(registration, "calculate_score", lambda *_: {"total_score": 100, "color_code": "green"})
    monkeypatch.setattr("database.db.blacklist_check", lambda **_: None)
    result = registration.run_moderation("d-track1b")
    assert result["status"] == "manual_review"
    assert updates.get("verification_level") is None


def test_p1_2_reject_revokes_level3_and_role(monkeypatch):
    from api import admin
    from database import registration_dal
    updates = {}
    monkeypatch.setattr(registration_dal, "get_driver", lambda _: {"id": "d-track1b", "verification_level": 3})
    monkeypatch.setattr(registration_dal, "update_driver", lambda _, values: updates.update(values))
    monkeypatch.setattr("api.push.send_to_user", lambda *args, **kwargs: None)
    monkeypatch.setattr("api.notifications.create_notification", lambda *args, **kwargs: None)
    admin.admin_reject("d-track1b", user="admin")
    assert updates["status"] == "rejected"
    assert updates["verification_level"] == 2
    assert updates["role"] == "client"


def test_p1_2_level3_gate_denies_rejected_driver(monkeypatch):
    from api import verification_gate
    monkeypatch.setattr(verification_gate, "BETA_MODE", False)
    monkeypatch.setattr(verification_gate.reg_dal, "get_driver_by_token", lambda _: "d-track1b")
    monkeypatch.setattr(verification_gate.reg_dal, "get_driver", lambda _: {"id": "d-track1b", "verification_level": 3, "status": "rejected"})
    with pytest.raises(HTTPException) as exc:
        verification_gate.require_level(3)("Bearer token")
    assert exc.value.status_code == 403


def test_p1_2_unauthorized_admin_dependency_rejects_non_admin():
    from api.admin import check_admin
    from fastapi.security import HTTPBasicCredentials
    with pytest.raises(HTTPException) as exc:
        check_admin(HTTPBasicCredentials(username="not-admin", password="wrong"))
    assert exc.value.status_code in (401, 403)


def test_p1_2_reapprove_restores_level3_idempotently(monkeypatch):
    from api import admin
    from database import registration_dal
    updates = []
    monkeypatch.setattr(registration_dal, "get_driver", lambda _: {"id": "d-track1b", "verification_level": 2, "status": "rejected"})
    monkeypatch.setattr(registration_dal, "update_driver", lambda _, values: updates.append(values))
    monkeypatch.setattr("api.push.send_to_user", lambda *args, **kwargs: None)
    monkeypatch.setattr("api.notifications.create_notification", lambda *args, **kwargs: None)
    admin.admin_approve("d-track1b", user="admin")
    admin.admin_approve("d-track1b", user="admin")
    assert len(updates) == 2
    assert all(item["status"] == "approved" and item["verification_level"] == 3 for item in updates)


def test_p2_ttn_unknown_trip_denied(monkeypatch):
    from api import documents
    class C:
        def execute(self, *args):
            return self
        def fetchone(self):
            return None
        def __enter__(self): return self
        def __exit__(self, *args): return False
    monkeypatch.setattr("database.db.get_conn", lambda: C())
    with pytest.raises(HTTPException) as exc:
        documents._require_ttn_participant("not-a-trip", {"id": "outsider"})
    assert exc.value.status_code == 404


class _TtnConn:
    def __init__(self, trip, deal=None):
        self.trip, self.deal = trip, deal
    def execute(self, sql, params):
        class Result:
            def __init__(self, row): self.row = row
            def fetchone(self): return self.row
        if "FROM trips" in sql:
            return Result(self.trip)
        deal = self.deal
        if deal and deal.get("status") in ("cancelled", "rejected"):
            deal = None
        if deal and len(params) >= 3 and params[1] not in (deal.get("shipper_id"), deal.get("driver_id")):
            deal = None
        return Result(deal)
    def __enter__(self): return self
    def __exit__(self, *args): return False


@pytest.mark.parametrize("user,deal,expected", [
    ({"id": "driver"}, None, None),
    ({"id": "driver"}, {"status": "accepted"}, None),
    ({"id": "shipper"}, {"status": "accepted"}, None),
])
def test_p2_ttn_owner_and_active_participants_allowed(monkeypatch, user, deal, expected):
    from api import documents
    trip = {"id": "trip-1", "driver_id": "driver"}
    if deal:
        deal = dict(deal, shipper_id="shipper", driver_id="driver")
    monkeypatch.setattr("database.db.get_conn", lambda: _TtnConn(trip, deal))
    assert documents._require_ttn_participant("trip-1", user)["id"] == "trip-1"


def test_p2_ttn_unrelated_and_cancelled_participant_denied(monkeypatch):
    from api import documents
    trip = {"id": "trip-1", "driver_id": "driver"}
    for user, deal, code in [
        ({"id": "outsider"}, {"status": "accepted", "shipper_id": "shipper", "driver_id": "driver"}, 403),
        ({"id": "shipper"}, {"status": "cancelled", "shipper_id": "shipper", "driver_id": "driver"}, 403),
    ]:
        monkeypatch.setattr("database.db.get_conn", lambda trip=trip, deal=deal: _TtnConn(trip, deal))
        with pytest.raises(HTTPException) as exc:
            documents._require_ttn_participant("trip-1", user)
        assert exc.value.status_code == code


def test_p2_ttn_anonymous_is_rejected_before_ownership(monkeypatch):
    from api import verification_gate
    with pytest.raises(HTTPException) as exc:
        verification_gate.require_level(1)(None)
    assert exc.value.status_code == 401


def test_marketplace_verified_badge_uses_approved_state_only():
    from api.marketplace import _driver_verified
    assert _driver_verified({"status": "manual_review", "verification_level": 2}) is False
    assert _driver_verified({"status": "rejected", "verification_level": 3}) is False
    assert _driver_verified({"status": "approved", "verification_level": 3}) is True
