"""RC1 regression: identical status events must not duplicate in Deal Room."""
from pathlib import Path
import sqlite3


def test_identical_status_event_is_inserted_once(tmp_path):
    db = tmp_path / "deal-room.db"
    conn = sqlite3.connect(db)
    schema = (
        Path(__file__).resolve().parents[1]
        / "database"
        / "schemas"
        / "deal_room_schema.sql"
    ).read_text(encoding="utf-8")
    conn.executescript(schema)

    params = (
        "deal-1",
        "deal.status_changed",
        "deal_event.status_changed",
        '{"status":"in_progress"}',
    )
    conn.execute(
        """
        INSERT INTO deal_events
            (id, deal_id, event_type, i18n_key, payload_json)
        VALUES ('event-1', ?, ?, ?, ?)
        """,
        params,
    )
    conn.execute(
        """
        INSERT INTO deal_events
            (id, deal_id, event_type, i18n_key, payload_json)
        VALUES ('event-2', ?, ?, ?, ?)
        """,
        params,
    )

    count = conn.execute(
        "SELECT COUNT(*) FROM deal_events WHERE deal_id = 'deal-1'"
    ).fetchone()[0]
    assert count == 1


def test_different_status_events_are_preserved(tmp_path):
    db = tmp_path / "deal-room.db"
    conn = sqlite3.connect(db)
    schema = (
        Path(__file__).resolve().parents[1]
        / "database"
        / "schemas"
        / "deal_room_schema.sql"
    ).read_text(encoding="utf-8")
    conn.executescript(schema)

    for index, status in enumerate(("in_progress", "delivered"), start=1):
        conn.execute(
            """
            INSERT INTO deal_events
                (id, deal_id, event_type, i18n_key, payload_json)
            VALUES (?, 'deal-1', 'deal.status_changed',
                    'deal_event.status_changed', ?)
            """,
            (f"event-{index}", f'{{"status":"{status}"}}'),
        )

    count = conn.execute(
        "SELECT COUNT(*) FROM deal_events WHERE deal_id = 'deal-1'"
    ).fetchone()[0]
    assert count == 2
