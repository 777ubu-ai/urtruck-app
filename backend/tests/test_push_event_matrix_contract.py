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
    # Push-closure track: title/text are now looked up via push_i18n
    # (localized), so post_notifs carries the raw (amount, route) instead of
    # pre-built RU strings — create_notification/send_to_user still receive
    # a `title`/`text` pair, just localized ones.
    assert 'create_notification(recipient, "bid_created", title, text, icon, url=url, event_key=event_key)' in MARKET
    assert 'post_notifs.append((row["owner_id"], money, route, "💰", bid_url, True))' in MARKET
    assert 'post_notifs.append((row["driver_id"], money, route, "💰", bid_url, True))' in MARKET
    assert 'bid_url = f"/cargos/{body.cargo_id}?bid={bid_id}"' in MARKET
    assert 'bid_url = f"/trips/{body.trip_id}?bid={bid_id}"' in MARKET
    assert 'push_i18n.push_text("bid_created", loc, amount=amount, route=route)' in MARKET


def test_bid_accepted_and_deal_created_keep_canonical_order_card_links():
    # Push-closure track: event_key added for durable-outbox retry; text
    # localized via push_i18n instead of hardcoded RU.
    assert 'create_notification(bid["bidder_id"], "bid_accepted", title, text, "✅", url=deal_url, event_key=event_key)' in MARKET
    assert 'push_i18n.push_text("bid_accepted", loc, amount=_money' in MARKET
    assert 'create_notification(uid_, "deal_created", title_, text_, "✅", url=deal_url)' in MARKET
    assert 'deal_url = f"/cargos/{bid[\'cargo_id\']}"' in MARKET or 'deal_url = f"/cargos/{bid["cargo_id"]}"' in MARKET
    assert 'deal_url = f"/trips/{bid[\'trip_id\']}"' in MARKET or 'deal_url = f"/trips/{bid["trip_id"]}"' in MARKET


def test_counter_cancellation_reaches_bidder_via_push_and_bell():
    # Push-closure track fix: this endpoint used to set data={"event": ...}
    # while _event_key() in services/push_sender.py reads data["event_key"]
    # specifically — that made it LOOK wired into the durable-outbox dedup
    # path while never actually being so. Confirm the correct field name is
    # now present, and that it is NOT the old broken pattern.
    assert 'kind="bid_counter_cancelled"' in MARKET
    assert '"event_key": event_key, "event": "bid.counter_cancelled"' in MARKET
    assert 'data={"bid_id": bid_id, "event": f"bid.counter_cancelled:{bid_id}"}' not in MARKET
    assert 'create_notification(bid["bidder_id"], "bid_countered"' in MARKET
    assert 'push_i18n.push_text("bid_counter_cancelled", loc, amount=' in MARKET


def test_chat_message_push_payload_keeps_room_sender_recipient_context():
    assert 'kind="chat"' in CHAT
    assert '"type": "chat_message"' in CHAT
    assert '"room_id": room_id' in CHAT
    assert '"sender_id": user["id"]' in CHAT
    assert '"recipient_id": recipient_id' in CHAT
    assert 'url=f"/chats/{room_id}"' in CHAT
    assert 'create_notification(' in CHAT
    assert '"chat_message"' in CHAT


def test_chat_attachment_push_payload_keeps_attachment_context():
    assert 'kind="chat"' in DEAL_ROOM
    assert '"type": "chat_attachment"' in DEAL_ROOM
    assert '"attachment_id": attachment_id' in DEAL_ROOM
    assert '"sender_id": user["id"]' in DEAL_ROOM
    assert '"recipient_id": recipient_id' in DEAL_ROOM
    assert 'url=f"/chats/{conversation_id}"' in DEAL_ROOM
    # Push-closure track: durable event_key from the persisted attachment id.
    assert '"event_key": event_key' in DEAL_ROOM
    assert '"chat_attachment"' in DEAL_ROOM
    assert 'create_notification(' in DEAL_ROOM


def test_deal_status_notifications_cover_release_status_flow():
    for status in ("in_progress", "at_border", "delivered", "received", "completed", "cancelled"):
        assert f'"{status}":' in MARKET
    # Push-closure track: title/body_txt now come from push_i18n (localized)
    # instead of the old hardcoded-RU `labels` dict; event_key added.
    assert 'title, body_txt = push_i18n.push_text(push_events[new_status], loc, route=route)' in MARKET
    assert 'create_notification(other_id, "deal_status", title, body_txt, "🚛", url=deal_url, event_key=event_key)' in MARKET
    assert 'send_to_user(other_id, title, body_txt, url=deal_url, kind="deal_status",' in MARKET
    assert 'event_key = f"deal:{deal_id}:status:{new_status}"' in MARKET


def test_tracking_notifications_use_deal_tracking_action_link_for_push_and_in_app():
    # Push-closure track: _tracking_notify() signature changed to
    # (user_id, event, deal_id, kind, event_key) — title/body now looked up
    # via push_i18n inside the function, not passed pre-built by callers.
    assert 'def _tracking_notify(user_id: str, event: str, deal_id: str, kind: str, event_key: str) -> None:' in MARKET
    assert 'title, body = push_i18n.push_text(event, loc)' in MARKET
    assert 'create_notification(user_id, kind, title, body, "📍", url=f"/deals/{deal_id}?action=tracking",' in MARKET
    assert 'push_sender.send(user_id, title, body, kind=kind,' in MARKET
    assert '"event_key": event_key, "event": event' in MARKET
    for kind in ("tracking_request", "tracking_approved", "tracking_declined", "tracking_stopped"):
        assert f'"{kind}' in MARKET or f"'{kind}'" in MARKET
    # Every call site derives event_key from a freshly-inserted
    # deal_tracking_events row id — never a bare per-deal constant (that
    # would wrongly dedupe a legitimate second request/approve/decline/stop).
    assert MARKET.count("_ev.lastrowid") >= 4


def test_push_api_wraps_background_sender_without_removing_kind_or_data():
    assert 'def send_to_user(user_id: str, title: str, body: str, url: str = "/", kind: str = "info", data: dict = None)' in PUSH
    assert 'push_sender.send(user_id, title, body, url=url, kind=kind, data=data)' in PUSH


def test_bid_expiry_has_no_notification_sender_yet_so_live_matrix_must_not_claim_pass():
    assert "create_notification(" not in EXPIRY
    assert "send_to_user(" not in EXPIRY
    assert "expired_bids" in EXPIRY


def test_critical_bid_and_deal_status_events_now_carry_typed_payload_and_event_key():
    # Push-closure track: the gap the old (removed) version of this test
    # documented — bid/deal-status routes only sending url+title/body with
    # no typed payload/event_key — is CLOSED for the critical families this
    # track was scoped to. Renamed from
    # test_non_chat_push_events_still_do_not_have_typed_payload_contract_everywhere
    # because that name asserted a gap that no longer exists; keeping the
    # old name and just flipping the assertions would silently misdescribe
    # what the test verifies to a future reader.
    info_calls = re.findall(r"send_to_user\([^\\n]+url=.*?\)", MARKET)
    assert info_calls, "expected marketplace push callsites to exist"
    assert 'send_to_user(recipient, title, text, url=url, kind="bid",' in MARKET
    assert 'send_to_user(bid["bidder_id"], title, text, url=deal_url, kind="bid",' in MARKET
    # Every one of these critical call sites carries "event_key" in its data.
    assert MARKET.count('"event_key": event_key') >= 4
