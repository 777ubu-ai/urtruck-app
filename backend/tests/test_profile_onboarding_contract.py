"""Регрессии двухшагового onboarding-профиля UrTruck.

Канон после auth + выбора роли:
- имя обязательно для driver и client;
- реальный телефон обязателен для driver и client;
- страна/город не блокируют завершение короткого onboarding;
- компания и preferred messenger необязательны;
- messenger_type=other поддерживается.
"""

import pytest
from fastapi import HTTPException

from api import profile


@pytest.fixture(autouse=True)
def isolate_profile_side_effects(monkeypatch):
    monkeypatch.setattr(profile, "_ensure_columns", lambda: None)


def _run(monkeypatch, body, current=None):
    current_row = {
        "id": "user-1",
        "phone": "auth_user-1",
        "full_name": "",
        "role": "guest",
        **(current or {}),
    }
    captured = {}
    monkeypatch.setattr(profile.reg_dal, "get_driver", lambda _uid: current_row)

    def _update(uid, values):
        captured["uid"] = uid
        captured["values"] = dict(values)

    monkeypatch.setattr(profile.reg_dal, "update_driver", _update)
    result = profile.update_profile(body, user={"id": "user-1"})
    return result, captured


def test_client_completes_short_profile_without_country_or_city(monkeypatch):
    result, captured = _run(
        monkeypatch,
        profile.UpdateProfileIn(
            role="client",
            name="Иван Петров",
            phone="+7 777 123 45 67",
            company_name="ТОО LogiTrans",
        ),
    )

    assert result == {"ok": True}
    assert captured["values"]["role"] == "client"
    assert captured["values"]["full_name"] == "Иван Петров"
    assert captured["values"]["phone"] == "+77771234567"
    assert captured["values"]["company_name"] == "ТОО LogiTrans"
    assert "country" not in captured["values"]
    assert "city" not in captured["values"]


def test_driver_name_is_required(monkeypatch):
    monkeypatch.setattr(
        profile.reg_dal,
        "get_driver",
        lambda _uid: {"id": "user-1", "phone": "auth_user-1", "full_name": ""},
    )

    with pytest.raises(HTTPException) as exc:
        profile.update_profile(
            profile.UpdateProfileIn(role="driver", name="", phone="+7 777 123 45 67"),
            user={"id": "user-1"},
        )

    assert exc.value.status_code == 400
    assert exc.value.detail["error"] == "NAME_REQUIRED"


@pytest.mark.parametrize("role", ["driver", "client"])
def test_real_phone_is_required_for_every_role(monkeypatch, role):
    monkeypatch.setattr(
        profile.reg_dal,
        "get_driver",
        lambda _uid: {"id": "user-1", "phone": "auth_user-1", "full_name": "Owner"},
    )

    with pytest.raises(HTTPException) as exc:
        profile.update_profile(
            profile.UpdateProfileIn(role=role, name="Owner"),
            user={"id": "user-1"},
        )

    assert exc.value.status_code == 400
    assert exc.value.detail["error"] == "PHONE_REQUIRED"


def test_other_messenger_and_optional_company_are_persisted(monkeypatch):
    result, captured = _run(
        monkeypatch,
        profile.UpdateProfileIn(
            role="driver",
            name="Wei Zhang",
            phone="+86 138 0013 8000",
            company_name="",
            messenger_type="other",
            messenger_id="cargo_contact_88",
        ),
    )

    assert result == {"ok": True}
    assert captured["values"]["role"] == "driver"
    assert captured["values"]["company_name"] == ""
    assert captured["values"]["messenger_type"] == "other"
    assert captured["values"]["messenger_id"] == "cargo_contact_88"


def test_whatsapp_contact_can_equal_primary_phone(monkeypatch):
    result, captured = _run(
        monkeypatch,
        profile.UpdateProfileIn(
            role="client",
            name="Aidan",
            phone="+7 701 111 22 33",
            messenger_type="whatsapp",
            messenger_id="+7 701 111 22 33",
        ),
    )

    assert result == {"ok": True}
    assert captured["values"]["phone"] == "+77011112233"
    assert captured["values"]["messenger_type"] == "whatsapp"
    assert captured["values"]["messenger_id"] == "+7 701 111 22 33"
