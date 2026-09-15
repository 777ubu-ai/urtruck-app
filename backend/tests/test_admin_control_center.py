"""Focused regression coverage for UrTruck Control Center contracts."""
import os
import tempfile
from pathlib import Path

_db_file = Path(tempfile.gettempdir()) / "urtruck_admin_control_test.db"
try:
    _db_file.unlink()
except FileNotFoundError:
    pass
os.environ["DB_PATH"] = str(_db_file)
os.environ["ENV"] = "test"
os.environ["URTRUCK_ENV"] = "test"
os.environ["URTRUCK_ADMIN_USER"] = "control-test"
os.environ["URTRUCK_ADMIN_PASS"] = "strong-control-test-password"

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.admin_control import control_router
from api.presence import presence_router
from database.db import get_conn
from database import registration_dal
from services import presence_service

app = FastAPI()
app.include_router(control_router, prefix="/admin/control")
app.include_router(presence_router, prefix="/api/v1/presence")
client = TestClient(app)
AUTH = ("control-test", "strong-control-test-password")


def setup_module():
    registration_dal.init_registration_schema()
    base = Path(__file__).resolve().parent.parent / "database"
    with get_conn() as c:
        c.executescript((base / "marketplace_schema.sql").read_text())
        c.executescript((base / "deals_schema.sql").read_text())
        c.executescript((base / "chat_schema.sql").read_text())
        c.executescript((base / "push_schema.sql").read_text())
        c.execute("CREATE TABLE IF NOT EXISTS deal_locations (deal_id TEXT PRIMARY KEY, lat REAL, lng REAL, heading REAL, speed REAL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)")
        c.execute("INSERT INTO drivers_registration(id, phone, role, full_name, verification_level, status) VALUES('driver-1','+77001234567','driver','Driver One',1,'approved')")
        c.execute("INSERT INTO drivers_registration(id, phone, role, full_name, verification_level, status) VALUES('client-1','+77007654321','client','Client One',1,'approved')")
        c.execute("INSERT INTO drivers_registration(id, phone, role, full_name, verification_level, status) VALUES('guest-1',NULL,'guest',NULL,0,'pending')")
        c.execute("INSERT INTO cargos(id,owner_id,from_city,to_city,cargo_desc,status) VALUES('cargo-1','client-1','Yiwu','Almaty','parts','active')")
        c.execute("INSERT INTO bids(id,cargo_id,bidder_id,amount,status) VALUES('bid-1','cargo-1','driver-1',8000,'accepted')")
        c.execute("INSERT INTO chat_rooms(id,participant_1,participant_2,cargo_id,deal_key,last_message,last_at) VALUES('room-1','client-1','driver-1','cargo-1','c:cargo-1:client-1:driver-1','SECRET CHAT TEXT',CURRENT_TIMESTAMP)")
        c.execute("INSERT INTO chat_messages(room_id,sender_id,text,is_voice) VALUES('room-1','driver-1','SECRET MESSAGE',0)")
        c.execute("INSERT INTO deals(id,cargo_id,bid_id,shipper_id,driver_id,from_city,to_city,amount,status,chat_room_id) VALUES('deal-1','cargo-1','bid-1','client-1','driver-1','Yiwu','Almaty',8000,'in_progress','room-1')")
        c.execute("INSERT INTO deal_locations(deal_id,lat,lng,updated_at) VALUES('deal-1',43.2,76.9,CURRENT_TIMESTAMP)")
        c.commit()


def test_summary_uses_real_tables_and_excludes_guest_from_users(monkeypatch):
    monkeypatch.setattr(presence_service, "snapshot", lambda *a, **k: {"available": True, "window_seconds": 90, "online": 2, "by_role": {"driver": 1, "client": 1}, "by_platform": {"android": 2}, "users": []})
    r = client.get("/admin/control/summary", auth=AUTH)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["presence"]["online"] == 2
    assert body["stats"]["users_total"] == 2
    assert body["stats"]["guests_total"] == 1
    assert body["stats"]["cargos_active"] == 1
    assert body["stats"]["deals_active"] == 1
    assert body["stats"]["gps_active"] == 1


def test_chats_endpoint_never_returns_message_body():
    r = client.get("/admin/control/chats", auth=AUTH)
    assert r.status_code == 200, r.text
    raw = r.text
    assert "SECRET CHAT TEXT" not in raw
    assert "SECRET MESSAGE" not in raw
    assert r.json()["chats"][0]["message_count"] == 1


def test_users_mask_phone():
    r = client.get("/admin/control/users", auth=AUTH)
    assert r.status_code == 200, r.text
    raw = r.text
    assert "+77001234567" not in raw
    assert any(u["role"] == "driver" for u in r.json()["users"])


def test_deals_returns_last_gps_point_read_only():
    r = client.get("/admin/control/deals", auth=AUTH)
    assert r.status_code == 200, r.text
    deal = r.json()["deals"][0]
    assert deal["id"] == "deal-1"
    assert deal["lat"] == 43.2
    assert deal["lng"] == 76.9


def test_control_requires_admin_basic():
    r = client.get("/admin/control/summary")
    assert r.status_code == 401


def test_system_state_is_read_only_and_reports_operational_keys():
    r = client.get("/admin/control/system", auth=AUTH)
    assert r.status_code == 200, r.text
    body = r.json()
    for key in ("environment", "release_sha", "server_time_utc", "presence_available", "push_pending", "push_dead", "active_deals", "gps_fresh", "gps_stale"):
        assert key in body
