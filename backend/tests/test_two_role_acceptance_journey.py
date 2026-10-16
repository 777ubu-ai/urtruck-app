"""Один изолированный API-путь грузоотправителя и водителя.

Проверяет штатные email OTP handlers (тестовый OTP-adapter, без внешней
доставки), канонические роли, публикацию груза, ставку, принятие, чат,
private attachment ownership, FSM, повторы и повторное чтение после нового
TestClient. Push/email провайдеры и файловое хранилище заменены явными QA
адаптерами; это не проверка внешней доставки или production storage.
"""
import hashlib
import uuid

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api import registration
from api.marketplace import mp_router
from api.chat import chat_router
from api.deal_room import deal_room_router
from api.profile import profile_router
from api.driver_registration import driver_reg_router
from database import registration_dal


def test_two_role_registration_cargo_deal_chat_attachment_and_delivery(
    monkeypatch, tmp_path
):
    # Keep the real OTP persistence/consume logic, while making the delivery
    # adapter explicitly local and deterministic. No email is sent.
    code = "7314"
    monkeypatch.setattr(registration, "generate_code", lambda: code)
    monkeypatch.setattr(registration, "limit_otp_send", lambda *_a, **_k: None)
    monkeypatch.setattr(registration, "limit_otp_send_ip", lambda *_a, **_k: None)
    monkeypatch.setattr(registration, "limit_otp_verify", lambda *_a, **_k: None)
    monkeypatch.setattr(
        registration.otp_service,
        "send_otp",
        lambda *_a, **_k: {
            "sent": True, "mock": True, "beta": False, "code": code, "error": None
        },
    )

    # Only the external push provider is suppressed; database-backed business
    # events and notifications remain on the application code path.
    from services import push_sender
    monkeypatch.setattr(push_sender, "send", lambda *_a, **_k: {"ok": True, "mock": True})

    app = FastAPI()
    app.include_router(registration.reg_router, prefix="/api/v1/register")
    app.include_router(profile_router, prefix="/api/v1/users")
    app.include_router(driver_reg_router, prefix="/api/v1/driver/registration")
    app.include_router(mp_router, prefix="/api/v1/market")
    app.include_router(chat_router, prefix="/api/v1/chat")
    app.include_router(deal_room_router, prefix="/api/v1")

    client = TestClient(app)
    run = uuid.uuid4().hex[:10]
    phone_suffix = str(int(run, 16) % 10_000_000).zfill(7)

    def register(email, role, phone, name):
        sent = client.post(
            "/api/v1/register/email/send",
            json={"email": email, "consent": True},
        )
        assert sent.status_code == 200, sent.text
        assert sent.json()["mock"] is True
        assert sent.json()["code"] == code
        verified = client.post(
            "/api/v1/register/email/verify",
            json={"email": email, "code": code},
        )
        assert verified.status_code == 200, verified.text
        auth = {"Authorization": f"Bearer {verified.json()['token']}"}
        profile = client.patch(
            "/api/v1/users/me",
            headers=auth,
            json={"name": name, "phone": phone, "role": role},
        )
        assert profile.status_code == 200, profile.text
        me = client.get("/api/v1/register/me", headers=auth)
        assert me.status_code == 200, me.text
        assert me.json()["role"] == role
        return verified.json()["user_id"], auth

    shipper_id, shipper_auth = register(
        f"shipper-{run}@qa.example", "client", f"+7701{phone_suffix}", "QA Shipper"
    )
    driver_id, driver_auth = register(
        f"driver-{run}@qa.example", "driver", f"+7702{phone_suffix}", "QA Driver"
    )
    outsider_id, outsider_auth = register(
        f"outsider-{run}@qa.example", "client", f"+7703{phone_suffix}", "QA Outsider"
    )

    cargo = client.post(
        "/api/v1/market/cargos",
        headers=shipper_auth,
        json={
            "from_city": "Алматы", "to_city": "Москва",
            "from_country": "KZ", "to_country": "RU",
            "cargo_desc": "Изолированная проверка", "cargo_type": "tent",
            "weight_tons": 10, "volume_m3": 40, "price": 1200,
            "currency": "USD", "pickup_date": "2099-01-01",
        },
    )
    assert cargo.status_code == 200, cargo.text
    cargo_id = cargo.json()["id"]

    bid = client.post(
        "/api/v1/market/bids", headers=driver_auth,
        json={"cargo_id": cargo_id, "amount": 1100, "message": "QA offer"},
    )
    assert bid.status_code == 200, bid.text
    bid_id = bid.json().get("id") or (bid.json().get("bid") or {}).get("id")
    assert bid_id
    assert client.post(
        f"/api/v1/market/bids/{bid_id}/accept", headers=outsider_auth
    ).status_code in (403, 404)
    accepted = client.post(
        f"/api/v1/market/bids/{bid_id}/accept", headers=shipper_auth
    )
    assert accepted.status_code == 200, accepted.text
    deal_id = accepted.json()["deal_id"]
    room_id = accepted.json()["chat_room_id"]
    repeated_accept = client.post(
        f"/api/v1/market/bids/{bid_id}/accept", headers=shipper_auth
    )
    assert repeated_accept.status_code == 409

    sent_message = client.post(
        "/api/v1/chat/send", headers=shipper_auth,
        json={
            "room_id": room_id, "cargo_id": cargo_id,
            "text": "QA conversation", "client_msg_id": f"journey-{run}-msg",
        },
    )
    assert sent_message.status_code == 200, sent_message.text
    message_id = sent_message.json().get("id") or sent_message.json().get("message_id")
    assert message_id
    duplicate_message = client.post(
        "/api/v1/chat/send", headers=shipper_auth,
        json={
            "room_id": room_id, "cargo_id": cargo_id,
            "text": "QA conversation", "client_msg_id": f"journey-{run}-msg",
        },
    )
    assert duplicate_message.status_code in (200, 409)

    # Use the actual attachment route, with a private, isolated local-file
    # adapter instead of a production/Supabase account.
    import api.deal_room as deal_room
    stored_files = {}

    def save_file(data, folder, *, ext, content_type):
        digest = hashlib.sha256(data).hexdigest()
        path = tmp_path / f"{digest}.{ext}"
        path.write_bytes(data)
        stored_files[digest] = {"path": path, "folder": folder, "mime": content_type}
        return f"/isolated-storage/{folder}/{digest}.{ext}"

    monkeypatch.setattr(deal_room.storage_service, "save_file", save_file)
    pdf = b"%PDF-1.7\nQA-only fixture\n"
    upload = client.post(
        f"/api/v1/chat/conversations/{room_id}/attachments",
        headers=shipper_auth,
        data={"kind": "document", "message_id": str(message_id), "client_upload_id": f"journey-{run}-pdf"},
        files={"file": ("qa-document.pdf", pdf, "application/pdf")},
    )
    assert upload.status_code == 200, upload.text
    attachment_id = upload.json()["attachment"]["id"]
    assert upload.json()["deduplicated"] is False
    retry_upload = client.post(
        f"/api/v1/chat/conversations/{room_id}/attachments",
        headers=shipper_auth,
        data={"kind": "document", "message_id": str(message_id), "client_upload_id": f"journey-{run}-pdf"},
        files={"file": ("qa-document.pdf", pdf, "application/pdf")},
    )
    assert retry_upload.status_code == 200, retry_upload.text
    assert retry_upload.json()["deduplicated"] is True
    assert retry_upload.json()["attachment"]["id"] == attachment_id
    assert len(stored_files) == 1
    assert next(iter(stored_files.values()))["path"].read_bytes() == pdf
    participant_attachments = client.get(
        f"/api/v1/chat/conversations/{room_id}/attachments", headers=driver_auth
    )
    assert participant_attachments.status_code == 200, participant_attachments.text
    assert [item["id"] for item in participant_attachments.json()["attachments"]] == [attachment_id]
    assert client.get(
        f"/api/v1/chat/conversations/{room_id}/attachments", headers=outsider_auth
    ).status_code == 403

    assert client.patch(
        f"/api/v1/market/deals/{deal_id}/status", headers=outsider_auth,
        params={"new_status": "in_progress"},
    ).status_code == 403
    assert client.patch(
        f"/api/v1/market/deals/{deal_id}/status", headers=shipper_auth,
        params={"new_status": "in_progress"},
    ).status_code == 403
    assert client.patch(
        f"/api/v1/market/deals/{deal_id}/status", headers=driver_auth,
        params={"new_status": "in_progress"},
    ).status_code == 200
    assert client.patch(
        f"/api/v1/market/deals/{deal_id}/status", headers=driver_auth,
        params={"new_status": "at_border"},
    ).status_code == 200
    assert client.patch(
        f"/api/v1/market/deals/{deal_id}/status", headers=driver_auth,
        params={"new_status": "delivered"},
    ).status_code == 200
    assert client.patch(
        f"/api/v1/market/deals/{deal_id}/status", headers=driver_auth,
        params={"new_status": "received"},
    ).status_code == 403
    received = client.patch(
        f"/api/v1/market/deals/{deal_id}/status", headers=shipper_auth,
        params={"new_status": "received"},
    )
    assert received.status_code == 200, received.text

    # Re-run the application's persistent-schema startup steps, construct a
    # fresh router graph, then re-fetch using the original sessions. This is
    # a startup/reopen rehearsal in one Python process, not a process/device
    # restart claim.
    from database import db as dbm, deal_room_dal
    from api.profile import _ensure_columns as ensure_profile_columns
    dbm.init_db()
    registration_dal.init_registration_schema()
    deal_room_dal.init_deal_room_schema()
    deal_room_dal.backfill_participants()
    ensure_profile_columns()

    reopened_app = FastAPI()
    reopened_app.include_router(registration.reg_router, prefix="/api/v1/register")
    reopened_app.include_router(profile_router, prefix="/api/v1/users")
    reopened_app.include_router(driver_reg_router, prefix="/api/v1/driver/registration")
    reopened_app.include_router(mp_router, prefix="/api/v1/market")
    reopened_app.include_router(chat_router, prefix="/api/v1/chat")
    reopened_app.include_router(deal_room_router, prefix="/api/v1")
    restarted_client = TestClient(reopened_app)
    assert restarted_client.get("/api/v1/register/me", headers=shipper_auth).json()["id"] == shipper_id
    assert restarted_client.get("/api/v1/register/me", headers=driver_auth).json()["id"] == driver_id
    assert restarted_client.get("/api/v1/register/me", headers=outsider_auth).json()["id"] == outsider_id
    for auth in (shipper_auth, driver_auth):
        history = restarted_client.get(f"/api/v1/chat/messages/{room_id}", headers=auth)
        assert history.status_code == 200, history.text
        assert any(
            message.get("text") == "QA conversation"
            for message in history.json()["messages"]
        )
    timeline = restarted_client.get(f"/api/v1/deals/{deal_id}/timeline", headers=shipper_auth)
    assert timeline.status_code == 200, timeline.text
    from database.db import get_conn
    with get_conn() as conn:
        deal = conn.execute("SELECT shipper_id,driver_id,status,cargo_id,chat_room_id FROM deals WHERE id=?", (deal_id,)).fetchone()
        messages = conn.execute("SELECT COUNT(*) AS n FROM chat_messages WHERE room_id=? AND sender_id=? AND text=?", (room_id, shipper_id, "QA conversation")).fetchone()["n"]
        attachment = conn.execute("SELECT id,uploader_id,conversation_id,message_id,upload_status,url FROM message_attachments WHERE id=?", (attachment_id,)).fetchone()
        deal_count = conn.execute("SELECT COUNT(*) AS n FROM deals WHERE bid_id=?", (bid_id,)).fetchone()["n"]
    assert tuple(deal) == (shipper_id, driver_id, "received", cargo_id, room_id)
    assert messages == 1
    assert attachment["uploader_id"] == shipper_id
    assert attachment["conversation_id"] == room_id
    assert str(attachment["message_id"]) == str(message_id)
    assert attachment["upload_status"] == "uploaded"
    assert attachment["url"].startswith("/isolated-storage/chat_attachments/")
    assert deal_count == 1
