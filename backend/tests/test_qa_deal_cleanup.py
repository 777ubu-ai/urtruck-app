"""P0 2026-09-02 — тест QA deal cleanup endpoint.

Проверяет, что /qa/cleanup/deals:
  1. Находит ТОЛЬКО сделки, где ОБА участника — QA-акторы
  2. Не трогает сделки с реальным пользователем
  3. dry_run возвращает бэкап но не мутирует
  4. confirm=true мутирует (отменяет сделки, удаляет чат)
  5. Уже отменённые не пере-отменяются

Run from backend/:
    DB_PATH=/tmp/urtruck_test_qa_deals.db python -m tests.test_qa_deal_cleanup
"""
import os
import sys
from pathlib import Path

TEST_DB = os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_qa_deals.db")
os.environ["QA_CLEANUP_TOKEN"] = "test-cleanup-token-123"

if os.environ.get("URTRUCK_PYTEST_SHARED_DB") != "1":
    Path(TEST_DB).unlink(missing_ok=True)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from api import verification_gate
import contextvars

_current_user = contextvars.ContextVar("user", default=None)


def fake_require_level(_min_level):
    from fastapi import HTTPException

    def dep():
        u = _current_user.get()
        if not u:
            raise HTTPException(status_code=401, detail="No test user set")
        return u

    return dep


verification_gate.require_level = fake_require_level

from fastapi import FastAPI
from fastapi.testclient import TestClient
from database import db as ddb

ddb.init_db()

from database import registration_dal

registration_dal.init_registration_schema()

from database.db import get_conn, new_id

# Применяем deal и chat схемы
for schema_file in ["deals_schema.sql", "chat_schema.sql", "notifications_schema.sql"]:
    p = ROOT / "database" / schema_file
    if p.exists():
        with get_conn() as c:
            c.executescript(p.read_text(encoding="utf-8"))

from api.qa import qa_router

app = FastAPI()
app.include_router(qa_router, prefix="/api/v1/qa")
client = TestClient(app)

TOKEN_HEADER = {"X-QA-Cleanup-Token": "test-cleanup-token-123"}


def expect(cond, msg):
    if not cond:
        print(f"FAIL: {msg}")
        sys.exit(1)
    print(f"  ok: {msg}")


def _seed_deals():
    """Создаём тестовые сделки: 3 QA-only + 1 с реальным юзером."""
    qa_deals = []
    real_deal_id = new_id()
    with get_conn() as c:
        # QA-сделка 1: boris(shipper) + serik(driver), accepted
        d1 = new_id()
        c.execute(
            "INSERT INTO deals (id, cargo_id, bid_id, shipper_id, driver_id, from_city, to_city, amount, status, chat_room_id) "
            "VALUES (?, ?, ?, 'agent-boris', 'agent-serik', 'Иу', 'Алматы', 306500, 'accepted', 'room-qa-1')",
            (d1, new_id(), new_id()),
        )
        # Чат для QA-сделки 1
        c.execute("INSERT INTO chat_rooms (id, participant_1, participant_2) VALUES ('room-qa-1', 'agent-boris', 'agent-serik')")
        c.execute("INSERT INTO chat_messages (room_id, sender_id, text, is_read) VALUES ('room-qa-1', 'agent-boris', 'тест 1', 0)")
        c.execute("INSERT INTO chat_messages (room_id, sender_id, text, is_read) VALUES ('room-qa-1', 'agent-serik', 'ответ', 1)")
        qa_deals.append(d1)

        # QA-сделка 2: fedya(shipper) + armando(driver), in_progress
        d2 = new_id()
        c.execute(
            "INSERT INTO deals (id, cargo_id, bid_id, shipper_id, driver_id, from_city, to_city, amount, status) "
            "VALUES (?, ?, ?, 'agent-fedya', 'agent-armando', 'Урумчи', 'Бишкек', 200000, 'in_progress')",
            (d2, new_id(), new_id()),
        )
        qa_deals.append(d2)

        # QA-сделка 3: boris + armando, уже cancelled
        d3 = new_id()
        c.execute(
            "INSERT INTO deals (id, cargo_id, bid_id, shipper_id, driver_id, from_city, to_city, amount, status) "
            "VALUES (?, ?, ?, 'agent-boris', 'agent-armando', 'Иу', 'Ташкент', 150000, 'cancelled')",
            (d3, new_id(), new_id()),
        )
        qa_deals.append(d3)

        # РЕАЛЬНАЯ сделка: boris(shipper) + real-user(driver) — НЕ должна затрагиваться
        c.execute(
            "INSERT INTO deals (id, cargo_id, bid_id, shipper_id, driver_id, from_city, to_city, amount, status) "
            "VALUES (?, ?, ?, 'agent-boris', 'real-user-123', 'Иу', 'Москва', 500000, 'in_progress')",
            (real_deal_id, new_id(), new_id()),
        )
        c.commit()

    return qa_deals, real_deal_id


QA_DEALS, REAL_DEAL_ID = _seed_deals()


def test_dry_run_finds_only_qa_deals():
    print("\n=== 1. dry_run: находит только QA-сделки (оба участника agent-*) ===")
    r = client.post("/api/v1/qa/cleanup/deals", json={"dry_run": True}, headers=TOKEN_HEADER)
    expect(r.status_code == 200, f"200 ok (got {r.status_code})")
    data = r.json()
    expect(data["dry_run"] is True, "dry_run=true")
    expect(data["deals_found"] == 3, f"3 QA-сделки найдены (got {data['deals_found']})")
    expect(data["to_cancel"] == 2, f"2 к отмене (1 уже cancelled), got {data['to_cancel']}")
    expect(data["already_cancelled"] == 1, f"1 уже cancelled, got {data['already_cancelled']}")
    # Бэкап содержит полные данные
    expect(len(data["backup"]) == 3, f"backup: 3 записи, got {len(data['backup'])}")
    backup_ids = {d["id"] for d in data["backup"]}
    expect(REAL_DEAL_ID not in backup_ids, "реальная сделка НЕ в backup")


def test_dry_run_does_not_mutate():
    print("\n=== 2. dry_run не мутирует БД ===")
    with get_conn() as c:
        row = c.execute("SELECT status FROM deals WHERE id = ?", (QA_DEALS[0],)).fetchone()
    expect(row["status"] == "accepted", f"сделка всё ещё accepted после dry_run, got {row['status']}")


def test_confirm_required():
    print("\n=== 3. мутация без confirm → 400 ===")
    r = client.post("/api/v1/qa/cleanup/deals", json={"dry_run": False, "confirm": False}, headers=TOKEN_HEADER)
    expect(r.status_code == 400, f"400 без confirm, got {r.status_code}")


def test_mutating_cleanup():
    print("\n=== 4. confirm=true: отменяет QA-сделки, чистит чат ===")
    r = client.post("/api/v1/qa/cleanup/deals",
                     json={"dry_run": False, "confirm": True, "include_chat": True},
                     headers=TOKEN_HEADER)
    expect(r.status_code == 200, f"200 ok (got {r.status_code})")
    data = r.json()
    expect(data.get("applied") is True, "applied=true")
    expect(data.get("deals_cancelled") == 2, f"2 сделки отменены (got {data.get('deals_cancelled')})")
    expect(data.get("chat_rooms_deleted", 0) >= 1, f"чат-комнаты удалены (got {data.get('chat_rooms_deleted')})")
    expect(data.get("chat_messages_deleted", 0) >= 2, f"сообщения удалены (got {data.get('chat_messages_deleted')})")


def test_deals_cancelled_in_db():
    print("\n=== 5. QA-сделки cancelled, реальная — нетронута ===")
    with get_conn() as c:
        for did in QA_DEALS:
            row = c.execute("SELECT status FROM deals WHERE id = ?", (did,)).fetchone()
            expect(row["status"] == "cancelled", f"QA-сделка {did[:8]}… cancelled, got {row['status']}")
        real = c.execute("SELECT status FROM deals WHERE id = ?", (REAL_DEAL_ID,)).fetchone()
        expect(real["status"] == "in_progress", f"реальная сделка нетронута: {real['status']}")


def test_chat_cleaned():
    print("\n=== 6. чат QA-комнат пуст ===")
    with get_conn() as c:
        rooms = c.execute("SELECT COUNT(*) FROM chat_rooms WHERE id = 'room-qa-1'").fetchone()
        expect(int(rooms[0]) == 0, "QA чат-комната удалена")
        msgs = c.execute("SELECT COUNT(*) FROM chat_messages WHERE room_id = 'room-qa-1'").fetchone()
        expect(int(msgs[0]) == 0, "QA сообщения удалены")


def test_preview_endpoint():
    print("\n=== 7. preview endpoint показывает текущее состояние ===")
    r = client.get("/api/v1/qa/cleanup/deals/preview", headers=TOKEN_HEADER)
    expect(r.status_code == 200, f"200 ok (got {r.status_code})")
    data = r.json()
    expect(data["total"] == 3, f"всего 3 QA-сделки, got {data['total']}")
    expect(data["by_status"].get("cancelled") == 3, f"все 3 — cancelled, got {data['by_status']}")


if __name__ == "__main__":
    print(f"Using DB: {TEST_DB}")
    test_dry_run_finds_only_qa_deals()
    test_dry_run_does_not_mutate()
    test_confirm_required()
    test_mutating_cleanup()
    test_deals_cancelled_in_db()
    test_chat_cleaned()
    test_preview_endpoint()
    print("\nAll QA deal cleanup tests passed.")
