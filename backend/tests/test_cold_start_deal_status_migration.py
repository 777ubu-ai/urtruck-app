"""Интеграционные проверки миграции chat_messages.event_id в новом процессе.

Каждый этап запускается в новом Python-процессе с отдельной SQLite. Тест
пустой БД импортирует полный main:app до подготовки схемы любым harness и
вызывает реальные HTTP-маршруты регистрации, груза, ставки, принятия и FSM.
Адаптеры доставки email и push заменены только локально для теста.
"""
import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _environment(tmp_path, db_path):
    return {
        "ENV": "test",
        "URTRUCK_ENV": "test",
        "BETA_MODE": "false",
        "BETA_OTP_CODE": "1975",
        "DB_PATH": str(db_path),
        "STORAGE_PROVIDER": "local",
        "STORAGE_LOCAL_ROOT": str(tmp_path / "storage"),
        "SENTRY_DSN": "",
        "TELEGRAM_BOT_TOKEN": "",
        "CGR_IIN_SALT": "cold-start-test-only-salt",
        "PUSH_PROVIDER_MODE": "mock",
        "ENABLE_DEMO_CHAT": "false",
        "SCHEDULER_ENABLED": "false",
        "PATH": os.environ.get("PATH", ""),
        "HOME": os.environ.get("HOME", ""),
        "PYTHONPATH": str(BACKEND_ROOT),
    }


def _run_phase(tmp_path, db_path, manifest_path, phase):
    result = subprocess.run(
        [sys.executable, str(Path(__file__).resolve()), phase, str(db_path), str(manifest_path)],
        cwd=BACKEND_ROOT,
        env=_environment(tmp_path, db_path),
        text=True,
        capture_output=True,
        timeout=90,
    )
    assert result.returncode == 0, result.stdout + "\n" + result.stderr
    return result


def test_full_main_cold_start_runs_deal_status_fsm_and_survives_process_restart(tmp_path):
    db_path = tmp_path / "empty.sqlite"
    manifest_path = tmp_path / "synthetic-session.json"

    _run_phase(tmp_path, db_path, manifest_path, "create")
    _run_phase(tmp_path, db_path, manifest_path, "verify")


def test_legacy_chat_messages_rows_survive_additive_event_id_migration_and_repeat_start(tmp_path):
    db_path = tmp_path / "legacy.sqlite"
    manifest_path = tmp_path / "legacy-row.json"
    with sqlite3.connect(db_path) as conn:
        conn.executescript(
            """
            CREATE TABLE chat_rooms (
              id TEXT PRIMARY KEY, participant_1 TEXT NOT NULL, participant_2 TEXT NOT NULL,
              owner_id TEXT, bidder_id TEXT, bid_id TEXT, cargo_id TEXT, trip_id TEXT,
              deal_key TEXT, last_message TEXT, last_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE chat_messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL,
              sender_id TEXT NOT NULL, text TEXT, photo_url TEXT,
              is_voice INTEGER DEFAULT 0, voice_duration INTEGER,
              voice_transcript TEXT, voice_transcript_lang TEXT,
              voice_transcript_provider TEXT, voice_transcribed_at TEXT,
              is_read INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            INSERT INTO chat_rooms(id,participant_1,participant_2,deal_key,last_message)
              VALUES('legacy-room','legacy-owner','legacy-driver','legacy-deal','preserve me');
            INSERT INTO chat_messages(id,room_id,sender_id,text,is_read)
              VALUES(41,'legacy-room','legacy-owner','legacy message',1);
            """
        )

    _run_phase(tmp_path, db_path, manifest_path, "legacy-check")
    _run_phase(tmp_path, db_path, manifest_path, "legacy-check")
    snapshot = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert snapshot == {
        "message": [41, "legacy-room", "legacy-owner", "legacy message", 1, None],
        "room": ["legacy-room", "legacy-owner", "legacy-driver", "legacy-deal", "preserve me"],
        "message_count": 1,
    }


def _child_main(phase, db_path, manifest_path):
    from fastapi.testclient import TestClient
    import main
    from api import registration
    from database.db import get_conn
    from services import push_sender

    code = "7462"
    registration.generate_code = lambda: code
    registration.limit_otp_send = lambda *_a, **_k: None
    registration.limit_otp_send_ip = lambda *_a, **_k: None
    registration.limit_otp_verify = lambda *_a, **_k: None
    registration.otp_service.send_otp = lambda *_a, **_k: {
        "sent": True, "mock": True, "beta": False, "code": code, "error": None
    }
    push_sender.send = lambda *_a, **_k: {"ok": True, "mock": True}

    if phase == "legacy-check":
        with TestClient(main.app) as client:
            assert client.get("/api/v1/system/info").status_code == 200
        with get_conn() as conn:
            row = conn.execute(
                "SELECT id,room_id,sender_id,text,is_read,event_id FROM chat_messages WHERE id=41"
            ).fetchone()
            room = conn.execute(
                "SELECT id,participant_1,participant_2,deal_key,last_message FROM chat_rooms WHERE id='legacy-room'"
            ).fetchone()
            count = conn.execute("SELECT COUNT(*) FROM chat_messages").fetchone()[0]
            assert "event_id" in {r["name"] for r in conn.execute("PRAGMA table_info(chat_messages)")}
            assert {r["name"] for r in conn.execute("PRAGMA index_list(chat_messages)")} >= {
                "idx_chat_msg_room", "idx_chat_msg_unread", "idx_chat_msg_client"
            }
        Path(manifest_path).write_text(json.dumps({
            "message": list(row), "room": list(room), "message_count": count
        }), encoding="utf-8")
        return

    manifest = Path(manifest_path)
    if phase == "verify":
        saved = json.loads(manifest.read_text(encoding="utf-8"))
        with TestClient(main.app) as client:
            for user in (saved["shipper"], saved["driver"], saved["outsider"]):
                me = client.get("/api/v1/register/me", headers=user["auth"])
                assert me.status_code == 200, me.text
                assert me.json()["id"] == user["id"]
            deal = client.get(
                f"/api/v1/deals/{saved['deal_id']}/timeline",
                headers=saved["shipper"]["auth"],
            )
            assert deal.status_code == 200, deal.text
            timeline_events = deal.json()["events"]
            status_events = [e for e in timeline_events if e["event_type"] == "deal.status_changed"]
            assert len(status_events) == 5
            assert [e["payload"]["status"] for e in status_events] == [
                "in_progress", "at_border", "delivered", "received", "completed"
            ]
            assert client.get(
                f"/api/v1/deals/{saved['deal_id']}/timeline",
                headers=saved["outsider"]["auth"],
            ).status_code == 403
            history = client.get(
                f"/api/v1/chat/messages/{saved['room_id']}",
                headers=saved["shipper"]["auth"],
            )
            assert history.status_code == 200, history.text
            status_messages = [m for m in history.json()["messages"] if m.get("event_id")]
            assert len(status_messages) == 5
            assert {m["text"] for m in status_messages} >= {
                "🚛 Рейс начался", "🛂 На границе",
                "✅ Доставлен — ожидается подтверждение получения",
                "✅ Получение подтверждено", "🤝 Сделка завершена",
            }
            assert client.patch(
                f"/api/v1/market/deals/{saved['deal_id']}/status",
                headers=saved["outsider"]["auth"], params={"new_status": "completed"},
            ).status_code == 403
        with get_conn() as conn:
            event_count = conn.execute(
                "SELECT COUNT(*) FROM deal_events WHERE deal_id=?", (saved["deal_id"],)
            ).fetchone()[0]
            completed_messages = conn.execute(
                "SELECT COUNT(*) FROM chat_messages WHERE room_id=? AND text='🤝 Сделка завершена'",
                (saved["room_id"],),
            ).fetchone()[0]
            status = conn.execute("SELECT status FROM deals WHERE id=?", (saved["deal_id"],)).fetchone()[0]
        assert event_count == 6  # bid accepted + five distinct status transitions
        assert completed_messages == 1
        assert status == "completed"
        return

    if phase != "create":
        raise AssertionError(f"unknown test phase: {phase}")

    with TestClient(main.app) as client:
        with get_conn() as conn:
            assert "event_id" in {r["name"] for r in conn.execute("PRAGMA table_info(chat_messages)")}

        run = "coldstart-main"

        def register(email, role, phone, name):
            sent = client.post("/api/v1/register/email/send", json={"email": email, "consent": True})
            assert sent.status_code == 200, sent.text
            verified = client.post(
                "/api/v1/register/email/verify", json={"email": email, "code": code}
            )
            assert verified.status_code == 200, verified.text
            auth = {"Authorization": f"Bearer {verified.json()['token']}"}
            profile = client.patch(
                "/api/v1/users/me", headers=auth,
                json={"name": name, "phone": phone, "role": role},
            )
            assert profile.status_code == 200, profile.text
            me = client.get("/api/v1/register/me", headers=auth)
            assert me.status_code == 200 and me.json()["role"] == role, me.text
            return {"id": verified.json()["user_id"], "auth": auth}

        shipper = register("cold-shipper@qa.example", "client", "+77010000101", "Cold Shipper")
        driver = register("cold-driver@qa.example", "driver", "+77020000102", "Cold Driver")
        outsider = register("cold-outsider@qa.example", "client", "+77030000103", "Cold Outsider")

        cargo = client.post("/api/v1/market/cargos", headers=shipper["auth"], json={
            "from_city": "Алматы", "to_city": "Москва", "from_country": "KZ", "to_country": "RU",
            "cargo_desc": "cold-start regression", "cargo_type": "tent", "weight_tons": 10,
            "volume_m3": 40, "price": 1200, "currency": "USD", "pickup_date": "2099-01-01",
        })
        assert cargo.status_code == 200, cargo.text
        bid = client.post("/api/v1/market/bids", headers=driver["auth"], json={
            "cargo_id": cargo.json()["id"], "amount": 1100, "message": "cold-start bid",
        })
        assert bid.status_code == 200, bid.text
        bid_id = bid.json().get("id") or bid.json()["bid"]["id"]
        assert client.post(f"/api/v1/market/bids/{bid_id}/accept", headers=outsider["auth"]).status_code in (403, 404)
        accepted = client.post(f"/api/v1/market/bids/{bid_id}/accept", headers=shipper["auth"])
        assert accepted.status_code == 200, accepted.text
        deal_id, room_id = accepted.json()["deal_id"], accepted.json()["chat_room_id"]
        assert client.post(f"/api/v1/market/bids/{bid_id}/accept", headers=shipper["auth"]).status_code == 409
        assert client.patch(
            f"/api/v1/market/deals/{deal_id}/status", headers=outsider["auth"],
            params={"new_status": "in_progress"},
        ).status_code == 403
        assert client.patch(
            f"/api/v1/market/deals/{deal_id}/status", headers=shipper["auth"],
            params={"new_status": "in_progress"},
        ).status_code == 403

        transitions = [
            ("in_progress", driver), ("at_border", driver), ("delivered", driver),
            ("received", shipper), ("completed", shipper),
        ]
        for status, actor in transitions:
            response = client.patch(
                f"/api/v1/market/deals/{deal_id}/status", headers=actor["auth"],
                params={"new_status": status},
            )
            assert response.status_code == 200, f"{status}: {response.status_code} {response.text}"
            if status == "in_progress":
                retry = client.patch(
                    f"/api/v1/market/deals/{deal_id}/status", headers=driver["auth"],
                    params={"new_status": status},
                )
                assert retry.status_code == 200, retry.text
        # Повтор запроса не добавляет событие или системное сообщение.
        assert client.patch(
            f"/api/v1/market/deals/{deal_id}/status", headers=shipper["auth"],
            params={"new_status": "completed"},
        ).status_code == 200
        history = client.get(f"/api/v1/chat/messages/{room_id}", headers=shipper["auth"])
        assert history.status_code == 200, history.text
        with get_conn() as conn:
            events = conn.execute("SELECT COUNT(*) FROM deal_events WHERE deal_id=?", (deal_id,)).fetchone()[0]
            completion_messages = conn.execute(
                "SELECT COUNT(*) FROM chat_messages WHERE room_id=? AND text='🤝 Сделка завершена'",
                (room_id,),
            ).fetchone()[0]
            assert events == 6
            assert completion_messages == 1

    manifest.write_text(json.dumps({
        "shipper": shipper, "driver": driver, "outsider": outsider,
        "deal_id": deal_id, "room_id": room_id, "cargo_id": cargo.json()["id"],
    }), encoding="utf-8")


if __name__ == "__main__":
    _child_main(sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3]))
