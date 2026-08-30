"""Push event matrix contract for the current release contour.

This is intentionally source-level contract coverage:
- verifies that each business event still creates an in-app notification
  and/or push with the expected canonical url/payload shape;
- fails fast if someone removes a recipient, downgrades a deep-link to "/",
  or drops chat/tracking context from payloads;
- does NOT pretend to be real-device delivery proof.
"""
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[2]
MARKET = (ROOT / "backend/api/marketplace.py").read_text(encoding="utf-8")
CHAT = (ROOT / "backend/api/chat.py").read_text(encoding="utf-8")
DEAL_ROOM = (ROOT / "backend/api/deal_room.py").read_text(encoding="utf-8")
PUSH = (ROOT / "backend/api/push.py").read_text(encoding="utf-8")
EXPIRY = (ROOT / "backend/services/bid_expiry.py").read_text(encoding="utf-8")


def test_bid_created_routes_to_owner_or_trip_driver_with_order_deeplink():
    assert 'create_notification(recipient, "bid_created", title, text, icon, url=url)' in MARKET
    assert 'post_notifs.append((row["owner_id"], title, text, "💰", bid_url, True))' in MARKET
    assert 'post_notifs.append((row["driver_id"], title, text, "📦", bid_url, True))' in MARKET
    assert 'bid_url = f"/cargos/{body.cargo_id}?bid={bid_id}"' in MARKET
    assert 'bid_url = f"/trips/{body.trip_id}?bid={bid_id}"' in MARKET


def test_bid_accepted_and_deal_created_keep_canonical_order_card_links():
    assert 'create_notification(bid["bidder_id"], "bid_accepted", title, text, "✅", url=deal_url)' in MARKET
    assert 'create_notification(uid_, "deal_created", title_, text_, "✅", url=deal_url)' in MARKET
    assert 'deal_url = f"/cargos/{bid[\'cargo_id\']}"' in MARKET or 'deal_url = f"/cargos/{bid["cargo_id"]}"' in MARKET
    assert 'deal_url = f"/trips/{bid[\'trip_id\']}"' in MARKET or 'deal_url = f"/trips/{bid["trip_id"]}"' in MARKET


def test_chat_message_push_payload_keeps_room_sender_recipient_context():
    assert 'kind="chat"' in CHAT
    assert '"type": "chat_message"' in CHAT
    assert '"room_id": room_id' in CHAT
    assert '"sender_id": user["id"]' in CHAT
    assert '"recipient_id": recipient_id' in CHAT
    assert 'url=f"/chats/{room_id}"' in CHAT


def test_chat_attachment_push_payload_keeps_attachment_context():
    assert 'kind="chat"' in DEAL_ROOM
    assert '"type": "chat_attachment"' in DEAL_ROOM
    assert '"attachment_id": att.get("id")' in DEAL_ROOM
    assert '"sender_id": user["id"]' in DEAL_ROOM
    assert '"recipient_id": recipient_id' in DEAL_ROOM
    assert 'url=f"/chats/{conversation_id}"' in DEAL_ROOM


def test_deal_status_notifications_cover_release_status_flow():
    for status in ("in_progress", "at_border", "delivered", "received", "completed", "cancelled"):
        assert f'"{status}":' in MARKET
    assert 'create_notification(other_id, "deal_status", labels[new_status], body_txt, "🚛", url=deal_url)' in MARKET
    assert 'send_to_user(other_id, labels[new_status], body_txt, url=deal_url)' in MARKET


def test_tracking_notifications_use_deal_tracking_action_link_for_push_and_in_app():
    assert 'create_notification(user_id, kind, title, body, "📍", url=f"/deals/{deal_id}?action=tracking")' in MARKET
    assert 'push_sender.send(user_id, title, body, kind=kind,' in MARKET
    assert 'data={"deal_id": deal_id, "action": "tracking"}' in MARKET
    for kind in ("tracking_request", "tracking_approved", "tracking_declined", "tracking_stopped"):
        assert f'"{kind}' in MARKET or f"'{kind}'" in MARKET


def test_push_api_wraps_background_sender_without_removing_kind_or_data():
    assert 'def send_to_user(user_id: str, title: str, body: str, url: str = "/", kind: str = "info", data: dict = None)' in PUSH
    assert 'push_sender.send(user_id, title, body, url=url, kind=kind, data=data)' in PUSH


def test_bid_expiry_has_no_notification_sender_yet_so_live_matrix_must_not_claim_pass():
    assert "create_notification(" not in EXPIRY
    assert "send_to_user(" not in EXPIRY
    assert "expired_bids" in EXPIRY


def test_non_chat_push_events_still_do_not_have_typed_payload_contract_everywhere():
    # Chat/tracking already send structured data. Bid/deal-status routes mostly
    # still rely on url + title/body only; this is a REAL gap the matrix must
    # report instead of claiming typed payload parity.
    info_calls = re.findall(r"send_to_user\([^\\n]+url=.*?\)", MARKET)
    assert info_calls, "expected marketplace push callsites to exist"
    assert 'send_to_user(recipient, title, text, url=url)' in MARKET
    assert 'send_to_user(bid["bidder_id"], title, text, url=deal_url)' in MARKET
