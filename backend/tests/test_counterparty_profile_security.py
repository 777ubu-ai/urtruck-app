"""IDOR/PII-аудит §12: GET /api/v1/users/counterparty/{other_user_id}.

api/profile.py::get_counterparty_profile — единственный способ клиенту
прочитать хоть что-то о профиле второй стороны сделки без polling чата.
Раньше в проекте уже была утечка телефона через похожий "профиль
контрагента" эндпоинт (см. changelog get_profile._is_real_phone). У ЭТОГО
конкретного эндпоинта на момент написания файла НЕ было ни одного
регрессионного теста — только ручной аудит кода. Этот файл фиксирует
контракт, чтобы будущий рефакторинг не мог тихо вернуть телефон/документы/
BIN в ответ или открыть эндпоинт постороннему без общей сделки.

Три аккаунта по паттерну test_idor_three_accounts.py:
  A — грузовладелец (client), сторона сделки.
  B — водитель (driver), вторая сторона той же сделки.
  C — посторонний авторизованный пользователь, НЕ участник ни одной сделки
      ни с A, ни с B.

CI-контракт: top-level `def test_*`, pytest порядок = порядок определения,
conftest.py поднимает полную схему до коллекции — свою init не делаем.
"""
import uuid

import contextvars

_current_user = contextvars.ContextVar("user", default=None)


def _fake_require_level(_min_level):
    from fastapi import HTTPException

    def dep():
        u = _current_user.get()
        if not u:
            raise HTTPException(status_code=401, detail="No test user set")
        return u

    return dep


from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.profile import profile_router, _ensure_columns as _profile_ensure_columns
from database.db import get_conn, new_id
from database import registration_dal as reg_dal
from tests.auth_harness import override_require_level

app = FastAPI()
app.include_router(profile_router, prefix="/api/v1/users")
override_require_level(app, _fake_require_level(1))
client = TestClient(app)

A = "cpty-shipper-" + uuid.uuid4().hex[:8]
B = "cpty-driver-" + uuid.uuid4().hex[:8]
C = "cpty-stranger-" + uuid.uuid4().hex[:8]

# Секретные поля, которых НИКОГДА не должно быть в ответе counterparty —
# даже для легитимного участника сделки (эндпоинт документирован как
# "safe identity card", не полный профиль).
_FORBIDDEN_KEYS = {
    "phone", "iin", "passport_intl_url", "tir_book_url", "cmr_insurance_url",
    "bin_inn", "messenger_type", "messenger_id", "emergency_contact",
    "about", "status", "created_at", "security_score", "security_color",
}
_ALLOWED_KEYS = {
    "id", "name", "role", "city", "country", "company_name",
    "vehicle_type", "vehicle_brand", "vehicle_plate", "verified",
}


def _seed_driver(user_id, *, full_name, role, phone, extra=None):
    row = {
        "full_name": full_name,
        "role": role,
        "phone": phone,
        "status": "approved",
        "verification_level": 2,
        "bin_inn": "123456789012",
        "messenger_type": "whatsapp",
        "messenger_id": "+7-secret-messenger",
        "emergency_contact": "+7-secret-emergency",
        "passport_intl_url": "storage/secret/passport.jpg",
        "iin": "9901" + uuid.uuid4().hex[:8],
    }
    if extra:
        row.update(extra)
    with get_conn() as c:
        existing = c.execute("SELECT id FROM drivers_registration WHERE id = ?", (user_id,)).fetchone()
        if existing:
            return
        cols = list(row.keys())
        placeholders = ",".join("?" for _ in cols)
        c.execute(
            f"INSERT INTO drivers_registration (id, {', '.join(cols)}) VALUES (?, {placeholders})",
            (user_id, *[row[k] for k in cols]),
        )


def _seed_deal(shipper_id, driver_id, status="accepted"):
    deal_id = new_id()
    with get_conn() as c:
        c.execute(
            """
            INSERT INTO deals (id, cargo_id, trip_id, bid_id, shipper_id, driver_id,
                                from_city, to_city, amount, status)
            VALUES (?, NULL, NULL, ?, ?, ?, 'Almaty', 'Astana', 1000, ?)
            """,
            (deal_id, new_id(), shipper_id, driver_id, status),
        )
    return deal_id


def _as(uid):
    _current_user.set({"id": uid, "full_name": uid, "phone": "+700",
                       "verification_level": 1, "role": "client"})


def setup_module(_module):
    # Pro-profile columns (bin_inn, messenger_*, ...) are added lazily by the
    # endpoint handler's own ALTER TABLE-if-missing — run it once up front so
    # this file's direct-SQL seeding can use those columns too.
    _profile_ensure_columns()
    _seed_driver(A, full_name="Shipper A", role="client", phone="+77010000001",
                 extra={"company_name": "OOO Alpha", "country": "KZ", "city": "Almaty"})
    _seed_driver(B, full_name="Driver B", role="driver", phone="+77010000002",
                 extra={"vehicle_type": "tent", "vehicle_brand": "MAN", "vehicle_plate": "A123BC02"})
    _seed_driver(C, full_name="Stranger C", role="client", phone="+77010000003")


def test_01_stranger_with_no_shared_deal_gets_403():
    _as(C)
    r = client.get(f"/api/v1/users/counterparty/{B}")
    assert r.status_code == 403
    assert r.json()["detail"]["error"] == "COUNTERPARTY_FORBIDDEN"


def test_02_self_lookup_rejected():
    _as(A)
    r = client.get(f"/api/v1/users/counterparty/{A}")
    assert r.status_code == 400


def test_03_unknown_user_id_with_no_deal_is_403_not_404():
    # Ownership check runs before existence check — must not leak whether
    # an arbitrary id exists in the system.
    _as(C)
    r = client.get("/api/v1/users/counterparty/does-not-exist-at-all")
    assert r.status_code == 403


def test_04_shared_deal_allows_read_but_only_safe_fields():
    _seed_deal(A, B, status="accepted")
    _as(A)
    r = client.get(f"/api/v1/users/counterparty/{B}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == B
    assert body["name"] == "Driver B"
    assert body["vehicle_plate"] == "A123BC02"
    # Hard contract: no PII/secret field ever leaks through this endpoint.
    leaked = _FORBIDDEN_KEYS & set(body.keys())
    assert not leaked, f"counterparty endpoint leaked forbidden fields: {leaked}"
    assert set(body.keys()) <= _ALLOWED_KEYS


def test_05_reverse_direction_also_allowed_and_safe():
    _as(B)
    r = client.get(f"/api/v1/users/counterparty/{A}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == A
    assert body["company_name"] == "OOO Alpha"
    leaked = _FORBIDDEN_KEYS & set(body.keys())
    assert not leaked, f"counterparty endpoint leaked forbidden fields: {leaked}"


def test_06_stranger_still_forbidden_even_though_a_deal_exists_between_others():
    # C is not a party to the A<->B deal seeded above — sharing a deal with
    # ANYONE must not open the door to reading an unrelated pair's profile.
    _as(C)
    r = client.get(f"/api/v1/users/counterparty/{A}")
    assert r.status_code == 403
    r = client.get(f"/api/v1/users/counterparty/{B}")
    assert r.status_code == 403


def test_07_cancelled_deal_still_allows_the_safe_card_by_design():
    # Documented behaviour: relation query has no status filter. Pinned here
    # so a future change is a deliberate decision, not a silent drift — and
    # because the endpoint only ever returns non-sensitive fields anyway.
    stranger_for_cancelled = "cpty-cancelled-driver-" + uuid.uuid4().hex[:8]
    _seed_driver(stranger_for_cancelled, full_name="Cancelled Counterparty",
                 role="driver", phone="+77010000004")
    _seed_deal(A, stranger_for_cancelled, status="cancelled")
    _as(A)
    r = client.get(f"/api/v1/users/counterparty/{stranger_for_cancelled}")
    assert r.status_code == 200
    leaked = _FORBIDDEN_KEYS & set(r.json().keys())
    assert not leaked


def test_archived_bidder_can_reopen_taken_cargo_but_stranger_still_cannot():
    """Archive rows must remain navigable after another driver wins."""
    from database.db import get_conn
    import uuid
    cargo_id = f"cargo-archive-{uuid.uuid4().hex[:8]}"
    bidder_id = f"bidder-archive-{uuid.uuid4().hex[:8]}"
    stranger_id = f"stranger-archive-{uuid.uuid4().hex[:8]}"
    owner_id = f"owner-archive-{uuid.uuid4().hex[:8]}"
    with get_conn() as c:
        c.execute("INSERT INTO cargos (id, owner_id, from_city, to_city, cargo_desc, status, price) VALUES (?, ?, 'Иу', 'Алматы', 'Archive cargo', 'taken', 9000)", (cargo_id, owner_id))
        c.execute("INSERT INTO bids (id, cargo_id, bidder_id, bidder_name, amount, status) VALUES (?, ?, ?, 'Archived bidder', 8500, 'rejected')", (f'bid-{uuid.uuid4().hex[:8]}', cargo_id, bidder_id))
    # The helper under test is the security source of truth for GET /cargos/{id}.
    from api.marketplace import _can_view_non_public_listing
    with get_conn() as c:
        row = dict(c.execute("SELECT * FROM cargos WHERE id = ?", (cargo_id,)).fetchone())
        assert _can_view_non_public_listing(c, table='cargos', listing_id=cargo_id, row=row, owner_field='owner_id', caller={'id': bidder_id}) is True
        assert _can_view_non_public_listing(c, table='cargos', listing_id=cargo_id, row=row, owner_field='owner_id', caller={'id': stranger_id}) is False
