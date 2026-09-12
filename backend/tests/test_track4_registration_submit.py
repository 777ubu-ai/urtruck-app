from api import driver_registration
from blacklist import manager as blacklist_mgr


def _driver(level=0, status="pending"):
    return {
        "id": "track4-driver",
        "phone": "+77000000000",
        "full_name": "QA Driver",
        "vehicle_plate": "KZ123",
        "verification_level": level,
        "status": status,
    }


def test_submit_untrusted_provider_stays_pending(monkeypatch):
    updates = {}
    monkeypatch.setattr(driver_registration.reg_dal, "get_driver", lambda _: _driver())
    monkeypatch.setattr(driver_registration.reg_dal, "update_driver", lambda _, fields: updates.update(fields))
    monkeypatch.setattr(blacklist_mgr, "check_blacklist", lambda **_: [])

    result = driver_registration.submit_registration("track4-driver")

    assert result["status"] == "pending"
    assert updates["status"] == "pending"
    assert updates["verification_level"] < 3
    assert updates["manual_review_required"] == 1


def test_submit_does_not_promote_documents_without_provider(monkeypatch):
    updates = {}
    driver = {**_driver(level=2), "id_front_url": "/id/front.jpg", "id_back_url": "/id/back.jpg"}
    monkeypatch.setattr(driver_registration.reg_dal, "get_driver", lambda _: driver)
    monkeypatch.setattr(driver_registration.reg_dal, "update_driver", lambda _, fields: updates.update(fields))
    monkeypatch.setattr(blacklist_mgr, "check_blacklist", lambda **_: [])

    driver_registration.submit_registration("track4-driver")

    assert updates["status"] == "pending"
    assert updates["verification_level"] == 2


def test_submit_preserves_existing_authorized_approval(monkeypatch):
    updates = {}
    monkeypatch.setattr(driver_registration.reg_dal, "get_driver", lambda _: _driver(level=3, status="approved"))
    monkeypatch.setattr(driver_registration.reg_dal, "update_driver", lambda _, fields: updates.update(fields))
    monkeypatch.setattr(blacklist_mgr, "check_blacklist", lambda **_: [])

    result = driver_registration.submit_registration("track4-driver")

    assert result["status"] == "approved"
    assert updates["status"] == "approved"
    assert updates["verification_level"] == 3
