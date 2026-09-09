"""P1 verification-trust bypass: admin reject must fully revoke trusted state.

Behavioral chain under test:
  driver with verification_provider_status='trusted_real', level 3, approved
  → POST /admin/reject (admin_reject)
  → driver re-calls POST /register/moderate (run_moderation)
  → must NOT auto-approve; recovery only via admin reapprove.
"""
import pytest
from fastapi import HTTPException


def _trusted_driver(**overrides):
    d = {
        "id": "d-p1-verify", "phone": "+77000000001", "full_name": "P1 QA",
        "whatsapp_verified": 1, "face_quality": 1.0, "iin": "870101350124",
        "license_verified": 1, "passport_verified": 1, "vehicle_type": "truck",
        "face_verified": 1, "license_ocr": '{"experience_years": 10}',
        "passport_ocr": '{"year": 2020, "plate_number": "777"}',
        "manual_review_required": 0, "verification_level": 3,
        "verification_provider_status": "trusted_real", "status": "approved",
        "role": "driver",
    }
    d.update(overrides)
    return d


def _patch_admin_side_effects(monkeypatch):
    monkeypatch.setattr("api.push.send_to_user", lambda *a, **k: None)
    monkeypatch.setattr("api.notifications.create_notification", lambda *a, **k: None)


def _run_reject(monkeypatch, driver, reason="Не прошёл проверку модератора"):
    """Вызывает admin_reject как POST /admin/reject/{id}; возвращает updates."""
    from api import admin
    from database import registration_dal
    updates = {}
    monkeypatch.setattr(registration_dal, "get_driver", lambda _: driver)
    monkeypatch.setattr(registration_dal, "update_driver", lambda _, values: updates.update(values))
    _patch_admin_side_effects(monkeypatch)
    admin.admin_reject(driver["id"], reason=reason, user="admin")
    return updates


def _run_approve(monkeypatch, driver):
    from api import admin
    from database import registration_dal
    updates = {}
    monkeypatch.setattr(registration_dal, "get_driver", lambda _: driver)
    monkeypatch.setattr(registration_dal, "update_driver", lambda _, values: updates.update(values))
    _patch_admin_side_effects(monkeypatch)
    admin.admin_approve(driver["id"], user="admin")
    return updates


def _run_moderate(monkeypatch, driver):
    """Вызывает run_moderation как POST /register/moderate; возвращает (result, updates)."""
    from api import registration
    updates = {}
    monkeypatch.setattr(registration.reg_dal, "get_driver", lambda _: driver)
    monkeypatch.setattr(registration.reg_dal, "update_driver", lambda _, values: updates.update(values))
    monkeypatch.setattr(registration, "calculate_score", lambda *_: {"total_score": 90, "color_code": "green"})
    monkeypatch.setattr("database.db.blacklist_check", lambda **_: None)
    result = registration.run_moderation(driver["id"])
    return result, updates


def test_reject_clears_trusted_provider_status_and_approved_at(monkeypatch):
    driver = _trusted_driver()
    updates = _run_reject(monkeypatch, driver)
    assert updates["status"] == "rejected"
    assert updates["verification_level"] == 2
    assert updates["role"] == "client"
    assert updates["approved_at"] is None
    # stale trusted_real не должен пережить reject
    assert "verification_provider_status" in updates
    assert updates["verification_provider_status"] in (None, "")


def test_rejected_driver_cannot_self_approve_via_moderate(monkeypatch):
    """Полная цепочка эксплойта: reject → driver сам зовёт /register/moderate."""
    driver = _trusted_driver()
    reject_updates = _run_reject(monkeypatch, driver)
    # persisted state после reject: админ перезаписал только свои поля,
    # остальное (в т.ч. stale verification_provider_status) — как в БД.
    driver.update(reject_updates)
    result, updates = _run_moderate(monkeypatch, driver)
    assert result["auto_approved"] is False
    assert result["status"] != "approved"
    assert updates["status"] != "approved"
    assert updates.get("verification_level") is None or updates.get("verification_level") < 3


def test_moderate_gate_blocks_stale_trusted_real_on_rejected_driver(monkeypatch):
    """Defense-in-depth: даже если stale trusted_real остался в строке
    (старые reject'ы до фикса), /register/moderate не должен auto-approve
    водителя в status='rejected'."""
    driver = _trusted_driver(status="rejected", verification_level=2, role="client")
    result, updates = _run_moderate(monkeypatch, driver)
    assert result["auto_approved"] is False
    assert result["status"] != "approved"
    assert updates["status"] != "approved"
    assert updates.get("manual_review_required") == 1


def test_rejected_driver_denied_at_level3_gate(monkeypatch):
    from api import verification_gate
    monkeypatch.setattr(verification_gate, "BETA_MODE", False)
    monkeypatch.setattr(verification_gate.reg_dal, "get_driver_by_token", lambda _: "d-p1-verify")
    monkeypatch.setattr(verification_gate.reg_dal, "get_driver",
                        lambda _: {"id": "d-p1-verify", "verification_level": 3, "status": "rejected"})
    with pytest.raises(HTTPException) as exc:
        verification_gate.require_level(3)("Bearer token")
    assert exc.value.status_code == 403


def test_reject_is_idempotent(monkeypatch):
    driver = _trusted_driver()
    first = _run_reject(monkeypatch, driver)
    driver.update(first)
    second = _run_reject(monkeypatch, driver, reason="повторно")
    assert first["status"] == second["status"] == "rejected"
    assert second["verification_level"] == 2
    assert second.get("verification_provider_status") in (None, "")


def test_admin_reapprove_restores_level3(monkeypatch):
    driver = _trusted_driver(status="rejected", verification_level=2, role="client",
                             verification_provider_status=None)
    updates = _run_approve(monkeypatch, driver)
    assert updates["status"] == "approved"
    assert updates["verification_level"] == 3
    assert updates["role"] == "driver"


def test_unrelated_account_cannot_reject_or_approve():
    from api.admin import check_admin
    from fastapi.security import HTTPBasicCredentials
    with pytest.raises(HTTPException) as exc:
        check_admin(HTTPBasicCredentials(username="not-admin", password="wrong"))
    assert exc.value.status_code in (401, 403)


def test_reject_resubmit_reapprove_restores_level3(monkeypatch):
    """Легитимный путь восстановления: reject → resubmission (/register/moderate
    → manual_review) → admin reapprove → level 3 снова работает."""
    from api import verification_gate
    driver = _trusted_driver()

    # 1) admin reject
    driver.update(_run_reject(monkeypatch, driver))
    assert driver["status"] == "rejected"
    assert driver.get("verification_provider_status") in (None, "")

    # 2) водитель resubmits → /register/moderate: только manual_review
    result, updates = _run_moderate(monkeypatch, driver)
    assert result["status"] == "manual_review"
    driver.update(updates)
    assert driver["status"] == "manual_review"

    # 3) admin reapprove → level 3 restored
    driver.update(_run_approve(monkeypatch, driver))
    assert driver["status"] == "approved"
    assert driver["verification_level"] == 3

    # 4) level3 gate снова пропускает
    monkeypatch.setattr(verification_gate, "BETA_MODE", False)
    monkeypatch.setattr(verification_gate.reg_dal, "get_driver_by_token", lambda _: driver["id"])
    monkeypatch.setattr(verification_gate.reg_dal, "get_driver", lambda _: driver)
    assert verification_gate.require_level(3)("Bearer token")["id"] == driver["id"]
