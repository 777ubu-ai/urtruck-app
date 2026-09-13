"""QA release-pass regression (chat/voice track): server-side bound on the
self-reported `voice_duration` field.

Root cause: POST /chat/send persisted `voice_duration` verbatim with zero
server-side validation — any client-reported value (negative, zero, or an
arbitrarily large number of seconds) was accepted. The recorder UI
(DealWorkspaceScreenV2's VOICE_MAX_DURATION_SEC) hard-stops at 60s, but that
is a client-only guard trivially bypassed by a modified client or a direct
API call. Fixed in api/chat.py's send_message: is_voice sends now reject a
reported duration outside (0, VOICE_MAX_DURATION_SEC + tolerance].

This does NOT (and cannot, without a new audio-parsing dependency such as
mutagen/ffprobe — none is in backend/requirements.txt) verify the ACTUAL
duration of the uploaded audio bytes; it only bounds the self-reported field
to the product's own contract. That limitation is intentional and documented
in chat.py next to VOICE_MAX_DURATION_SEC.

Self-contained: uses the same direct-function-call harness as
test_deal_rooms.py (calls send_message()/SendMessageIn directly, bypassing
the FastAPI Depends layer by passing `user=` explicitly) — no HTTP client
needed for this narrow a check.
"""
import os
import uuid
from pathlib import Path

os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_voice_duration_boundary.db")
if not os.environ.get("URTRUCK_TEST_HARNESS_OWNS_DB"):
    Path(os.environ["DB_PATH"]).unlink(missing_ok=True)

from database import db as dbm
from database import registration_dal
dbm.init_db()
registration_dal.init_registration_schema()

from database.db import get_conn
from fastapi import HTTPException
import pytest

from api.chat import (
    get_or_create_deal_room,
    send_message,
    SendMessageIn,
    VOICE_MAX_DURATION_SEC,
    VOICE_DURATION_TOLERANCE_SEC,
)


def _u(uid):
    return {"id": uid, "full_name": uid, "phone": "+7" + uid[:6]}


def _mk_users(*uids):
    with get_conn() as c:
        for u in uids:
            try:
                c.execute("INSERT INTO drivers_registration (id, full_name, phone) VALUES (?,?,?)",
                          (u, u, "+7" + u[:6]))
            except Exception:
                pass


def _mk_accepted_deal(cargo, owner, driver, room):
    deal_id = "deal_" + uuid.uuid4().hex[:8]
    with get_conn() as c:
        c.execute(
            "INSERT INTO deals (id, cargo_id, trip_id, bid_id, shipper_id, driver_id, "
            "from_city, to_city, amount, status, chat_room_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (deal_id, cargo, None, "bid_" + uuid.uuid4().hex[:8], owner, driver,
             "Almaty", "Astana", 1000, "accepted", room),
        )
    return deal_id


def _setup_room():
    o, d = "own_" + uuid.uuid4().hex[:6], "drv_" + uuid.uuid4().hex[:6]
    cargo = "cg_" + uuid.uuid4().hex[:6]
    _mk_users(o, d)
    room = get_or_create_deal_room(cargo, o, d)
    _mk_accepted_deal(cargo, o, d, room)
    return room, o, d


def _send_voice(room, sender, duration, client_msg_id):
    return send_message(
        SendMessageIn(room_id=room, is_voice=True, text="🎤 voice",
                      voice_duration=duration, client_msg_id=client_msg_id),
        user=_u(sender),
    )


def test_exact_max_duration_accepted():
    room, o, d = _setup_room()
    result = _send_voice(room, d, VOICE_MAX_DURATION_SEC, "dur-exact-max")
    assert result["ok"] is True


def test_one_second_under_max_accepted():
    room, o, d = _setup_room()
    result = _send_voice(room, d, VOICE_MAX_DURATION_SEC - 1, "dur-under-max")
    assert result["ok"] is True


def test_within_tolerance_over_max_accepted():
    """A real device may report a hair over the UI cap (stop-timer/encoding
    rounding) — the tolerance exists precisely so a legitimate ~60s
    recording is never rejected on a rounding technicality."""
    room, o, d = _setup_room()
    result = _send_voice(room, d, VOICE_MAX_DURATION_SEC + VOICE_DURATION_TOLERANCE_SEC, "dur-tolerance")
    assert result["ok"] is True


def test_beyond_tolerance_rejected():
    room, o, d = _setup_room()
    with pytest.raises(HTTPException) as exc:
        _send_voice(room, d, VOICE_MAX_DURATION_SEC + VOICE_DURATION_TOLERANCE_SEC + 1, "dur-over")
    assert exc.value.status_code == 400


def test_grossly_oversized_duration_rejected():
    room, o, d = _setup_room()
    with pytest.raises(HTTPException) as exc:
        _send_voice(room, d, 3600, "dur-huge")
    assert exc.value.status_code == 400


def test_zero_duration_rejected():
    room, o, d = _setup_room()
    with pytest.raises(HTTPException) as exc:
        _send_voice(room, d, 0, "dur-zero")
    assert exc.value.status_code == 400


def test_negative_duration_rejected():
    room, o, d = _setup_room()
    with pytest.raises(HTTPException) as exc:
        _send_voice(room, d, -5, "dur-negative")
    assert exc.value.status_code == 400


def test_missing_duration_still_accepted():
    """voice_duration is optional (older clients may omit it) — absence must
    not be conflated with an invalid value."""
    room, o, d = _setup_room()
    result = _send_voice(room, d, None, "dur-missing")
    assert result["ok"] is True


def test_oversized_duration_does_not_persist_a_row():
    """A rejected send must not silently insert a message — the whole point
    of a 400 is that the caller retries with a valid payload, not that a bad
    row already landed."""
    room, o, d = _setup_room()
    with pytest.raises(HTTPException):
        _send_voice(room, d, 999, "dur-not-persisted")
    with get_conn() as c:
        row = c.execute(
            "SELECT 1 FROM chat_messages WHERE room_id = ? AND client_msg_id = ?",
            (room, "dur-not-persisted"),
        ).fetchone()
    assert row is None


def test_text_message_unaffected_by_duration_bound():
    """The bound only applies to is_voice=True sends."""
    room, o, d = _setup_room()
    result = send_message(
        SendMessageIn(room_id=room, text="plain text, not voice", client_msg_id="dur-not-voice"),
        user=_u(d),
    )
    assert result["ok"] is True
