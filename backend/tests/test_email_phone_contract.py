"""P1 email-phone / shipper identity contract.

Current product rule:
- email signup requires phone for both roles;
- shipper (client) requires name + country + phone;
- driver requires phone (and the active ProfileV2 also collects driver name/city).

Run from backend/:
    DB_PATH=/tmp/urtruck_test_emailphone.db python -m tests.test_email_phone_contract
"""
import contextvars
import os
import sys
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_emailphone.db")
Path(TEST_DB).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from api import verification_gate
_current_user = contextvars.ContextVar("user", default=None)


def fake_require_level(_min):
    from fastapi import HTTPException
    def dep():
        u = _current_user.get()
        if not u:
            raise HTTPException(status_code=401, detail="no user")
        return u
    return dep


verification_gate.require_level = fake_require_level

from database import db as ddb
ddb.init_db()
from database import registration_dal as reg_dal
reg_dal.init_registration_schema()

from fastapi import FastAPI
from fastapi.testclient import TestClient
from api.profile import profile_router

app = FastAPI()
app.include_router(profile_router, prefix="/api/v1/users")
client = TestClient(app)


def seed(identifier):
    d = reg_dal.get_or_create_driver(identifier)
    return d["id"]


def as_user(uid):
    _current_user.set({"id": uid, "verification_level": 1})


def patch_me(payload):
    return client.patch("/api/v1/users/me", json=payload)


def test_email_driver_without_phone_rejected():
    uid = seed("driver1@example.com")
    as_user(uid)
    r = patch_me({"role": "driver", "name": "Иван"})
    assert r.status_code == 400, r.text
    assert r.json()["detail"]["error"] == "PHONE_REQUIRED"


def test_email_shipper_without_name_rejected():
    uid = seed("shipper1@example.com")
    as_user(uid)
    r = patch_me({"role": "client", "country": "Китай", "phone": "+7 701 123 45 67"})
    assert r.status_code == 400, r.text
    assert r.json()["detail"]["error"] == "NAME_REQUIRED"


def test_email_shipper_without_country_rejected():
    uid = seed("shipper-country@example.com")
    as_user(uid)
    r = patch_me({"role": "client", "name": "Boris Zhang", "phone": "+8613800000000"})
    assert r.status_code == 400, r.text
    assert r.json()["detail"]["error"] == "COUNTRY_REQUIRED"


def test_email_shipper_with_name_country_and_phone_ok():
    uid = seed("shipper2@example.com")
    as_user(uid)
    r = patch_me({"role": "client", "name": "ООО Ромашка", "country": "Китай", "phone": "+77011234567"})
    assert r.status_code == 200, r.text
    d = reg_dal.get_driver(uid)
    assert d["role"] == "client"
    assert d["country"] == "Китай"
    assert "".join(ch for ch in d["phone"] if ch.isdigit()).endswith("77011234567")


def test_email_driver_with_phone_ok():
    uid = seed("driver2@example.com")
    as_user(uid)
    r = patch_me({"role": "driver", "name": "Пётр", "phone": "+7 777 000 11 22"})
    assert r.status_code == 200, r.text
    assert reg_dal.get_driver(uid)["role"] == "driver"


def test_phone_signup_driver_not_broken():
    uid = seed("+77015550001")
    as_user(uid)
    r = patch_me({"role": "driver"})
    assert r.status_code == 200, r.text
    assert reg_dal.get_driver(uid)["role"] == "driver"


def test_shipper_reuses_existing_name_country_and_phone():
    uid = seed("+77015550002")
    reg_dal.update_driver(uid, {"full_name": "Уже Есть", "country": "Казахстан"})
    as_user(uid)
    r = patch_me({"role": "client"})
    assert r.status_code == 200, r.text


def test_invalid_phone_without_role_rejected():
    uid = seed("driver3@example.com")
    as_user(uid)
    r = patch_me({"phone": "123"})
    assert r.status_code == 400, r.text
    assert r.json()["detail"]["error"] == "INVALID_PHONE"


if __name__ == "__main__":
    fails = 0
    for fn in [
        test_email_driver_without_phone_rejected,
        test_email_shipper_without_name_rejected,
        test_email_shipper_without_country_rejected,
        test_email_shipper_with_name_country_and_phone_ok,
        test_email_driver_with_phone_ok,
        test_phone_signup_driver_not_broken,
        test_shipper_reuses_existing_name_country_and_phone,
        test_invalid_phone_without_role_rejected,
    ]:
        try:
            fn(); print(f"  ✅ {fn.__name__}")
        except Exception as e:
            fails += 1; print(f"  ❌ {fn.__name__}: {e}")
    print(f"\n{'ВСЕ ЗЕЛЁНЫЕ' if not fails else str(fails)+' FAIL'}")
    sys.exit(1 if fails else 0)
