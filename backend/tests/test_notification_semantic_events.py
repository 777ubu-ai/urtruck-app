"""P1-5/P1-6: notification errors stay visible and deal events stay locale-neutral."""
import json

from api import notifications as notifications_api
from database.db import get_conn


def test_semantic_notification_round_trip_uses_server_event_and_payload():
    user_id = "semantic-notification-user"
    notifications_api.create_notification(
        user_id,
        "deal_status",
        "legacy fallback title",
        "legacy fallback body",
        "🚛",
        url="/deals/deal-semantic",
        semantic_type="deal.status_changed",
        semantic_payload={
            "status": "awaiting_confirmation",
            "from_city": "Алматы",
            "to_city": "Урумчи",
            "amount": "$3,500",
        },
    )

    response = notifications_api.list_notifications(user={"id": user_id})
    item = response["notifications"][0]
    assert item["event_type"] == "deal.status_changed"
    assert item["event_payload"] == {
        "status": "awaiting_confirmation",
        "from_city": "Алматы",
        "to_city": "Урумчи",
        "amount": "$3,500",
    }
    assert "event_payload_json" not in item
    assert item["title"] == "legacy fallback title"


def test_semantic_columns_are_additive_and_legacy_rows_remain_readable():
    with get_conn() as conn:
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(notifications)")}
        assert {"event_type", "event_payload_json", "event_key"} <= columns
        conn.execute(
            "INSERT INTO notifications(user_id,type,title,body) VALUES(?,?,?,?)",
            ("legacy-semantic-user", "legacy", "Legacy title", "Legacy body"),
        )
    response = notifications_api.list_notifications(user={"id": "legacy-semantic-user"})
    assert response["notifications"][0]["title"] == "Legacy title"
    assert response["notifications"][0].get("event_type") is None
    assert "event_payload" not in response["notifications"][0]


def test_malformed_semantic_payload_fails_closed_to_empty_object():
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO notifications(user_id,type,title,event_type,event_payload_json) VALUES(?,?,?,?,?)",
            ("malformed-semantic-user", "deal_status", "Fallback", "deal.status_changed", "not-json"),
        )
    response = notifications_api.list_notifications(user={"id": "malformed-semantic-user"})
    assert response["notifications"][0]["event_payload"] == {}


def test_semantic_payload_is_valid_json_not_interpolated_copy():
    notifications_api.create_notification(
        "semantic-json-user", "deal_created", "RU fallback", "RU fallback body",
        semantic_type="deal.created", semantic_payload={"amount": "¥25,000"},
    )
    with get_conn() as conn:
        row = conn.execute(
            "SELECT event_type,event_payload_json FROM notifications WHERE user_id=?",
            ("semantic-json-user",),
        ).fetchone()
    assert row["event_type"] == "deal.created"
    assert json.loads(row["event_payload_json"]) == {"amount": "¥25,000"}
