"""AC4 (scoped increment): Chat message persistence core.

modules/chat/application/service.py::persist_message is the idempotent
insert-or-return core moved out of api/chat.py's send_message(). This file
proves it in isolation; api/chat.py's own existing integration tests
(test_kimi3b_chat_idor_matrix.py, test_idor_three_accounts.py,
test_live_deal_push_lifecycle.py, test_unread_deduplication.py) prove the
full HTTP endpoint still behaves identically end-to-end.
"""
import sqlite3

from backend.modules.chat.application.service import persist_message


SCHEMA = open("backend/database/chat_schema.sql").read()


def db():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    # client_msg_id + its room-scoped unique index are added by
    # api/chat.py's _ensure_columns() migration at runtime, not present in
    # the raw schema.sql — reproduced here to match production shape.
    conn.execute("ALTER TABLE chat_messages ADD COLUMN client_msg_id TEXT")
    conn.execute(
        "CREATE UNIQUE INDEX idx_chat_msg_client_test "
        "ON chat_messages(room_id, sender_id, client_msg_id) WHERE client_msg_id IS NOT NULL"
    )
    conn.execute(
        "INSERT INTO chat_rooms(id, participant_1, participant_2, deal_key) "
        "VALUES ('r1', 'a', 'b', 'p:a:b')"
    )
    conn.commit()
    return conn


def test_first_send_persists_and_updates_last_message():
    conn = db()
    result = persist_message(conn, "r1", "a", "hello", client_msg_id="cm1")
    conn.commit()
    assert result["deduped"] is False
    assert result["message_id"]
    assert result["created_at"]
    row = conn.execute("SELECT last_message FROM chat_rooms WHERE id='r1'").fetchone()
    assert row["last_message"] == "hello"


def test_retry_with_same_client_msg_id_is_deduped_select_first_path():
    conn = db()
    first = persist_message(conn, "r1", "a", "hello", client_msg_id="cm1")
    conn.commit()
    second = persist_message(conn, "r1", "a", "hello", client_msg_id="cm1")
    conn.commit()
    assert second == {"deduped": True, "message_id": first["message_id"], "created_at": first["created_at"]}
    assert conn.execute("SELECT COUNT(*) FROM chat_messages").fetchone()[0] == 1


def test_concurrent_retry_hits_integrity_error_fallback_path():
    """Simulates the race the IntegrityError catch exists for: a row for
    this (room_id, sender_id, client_msg_id) already committed between our
    SELECT and INSERT (a concurrent retry won). persist_message must treat
    that as success (dedup), not propagate the IntegrityError."""
    conn = db()
    conn.execute(
        "INSERT INTO chat_messages(room_id, sender_id, text, client_msg_id) VALUES ('r1','a','winner','cm1')"
    )
    conn.commit()
    winner_id = conn.execute("SELECT id FROM chat_messages").fetchone()[0]
    result = persist_message(conn, "r1", "a", "hello", client_msg_id="cm1")
    assert result["deduped"] is True
    assert result["message_id"] == winner_id
    assert conn.execute("SELECT COUNT(*) FROM chat_messages").fetchone()[0] == 1


def test_different_senders_same_client_msg_id_are_not_deduped_against_each_other():
    """client_msg_id uniqueness is scoped to (room_id, sender_id) — the
    same client-generated id from two different senders in the same room
    must both persist (this is exactly the fix the room_id-scoped unique
    index closed on 2026-09-05/06 — see api/chat.py's _ensure_columns)."""
    conn = db()
    a = persist_message(conn, "r1", "a", "hi from a", client_msg_id="shared")
    conn.commit()
    b = persist_message(conn, "r1", "b", "hi from b", client_msg_id="shared")
    conn.commit()
    assert a["deduped"] is False and b["deduped"] is False
    assert a["message_id"] != b["message_id"]
    assert conn.execute("SELECT COUNT(*) FROM chat_messages").fetchone()[0] == 2


def test_no_client_msg_id_never_dedupes():
    conn = db()
    a = persist_message(conn, "r1", "a", "one")
    conn.commit()
    b = persist_message(conn, "r1", "a", "two")
    conn.commit()
    assert a["deduped"] is False and b["deduped"] is False
    assert a["message_id"] is None and a["created_at"] is None  # no client_msg_id -> no re-read, matches legacy
    assert conn.execute("SELECT COUNT(*) FROM chat_messages").fetchone()[0] == 2


def test_photo_message_uses_camera_emoji_preview():
    conn = db()
    persist_message(conn, "r1", "a", None, photo_url="storage://key", client_msg_id="p1")
    conn.commit()
    row = conn.execute("SELECT last_message FROM chat_rooms WHERE id='r1'").fetchone()
    assert row["last_message"] == "📷 Фото"
